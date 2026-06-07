#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

cmd="${1:-help}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="infra/containers/compose.yaml"
compose_host_network_file="infra/containers/compose.host-network.yaml"
simulator_dir=".simulator"
simulator_pid_file="$simulator_dir/pid"
simulator_log_file="$simulator_dir/simulator.log"
isolated_stack_data_dir="/tmp/planning-poker-packaged-test-data"
required_node_version_file=".nvmrc"
tracked_deployment_config="config/deployment.toml"
local_deployment_config="config/deployment.local.toml"
packaged_test_config_dir=""

required_node_version() {
  if [[ -f "$required_node_version_file" ]]; then
    tr -d '[:space:]' <"$required_node_version_file"
    return
  fi

  echo "22"
}

required_node_major() {
  local version
  version="$(required_node_version)"
  echo "${version%%.*}"
}

is_node_dependent_command() {
  case "$1" in
    deps | build | lint | typecheck | test:unit | test:int | test:web | test:web:perf | test:e2e | test:e2e:perf | test:e2e:sim | test:e2e:sim:matrix21 | phase:p2:verify | phase:p3:verify | test:full | stack:up | sim:seed | sim:up)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

use_nvm_runtime() {
  local nvm_script

  if ! command -v nvm >/dev/null 2>&1; then
    for nvm_script in "${NVM_DIR:-}/nvm.sh" "$HOME/.nvm/nvm.sh"; do
      if [[ -n "$nvm_script" && -s "$nvm_script" ]]; then
        # shellcheck source=/dev/null
        . "$nvm_script"
        break
      fi
    done
  fi

  if command -v nvm >/dev/null 2>&1; then
    nvm use
  fi
}

require_node_runtime() {
  local required_version required_major current_version current_major
  required_version="$(required_node_version)"
  required_major="$(required_node_major)"

  use_nvm_runtime

  if ! command -v node >/dev/null 2>&1; then
    cat >&2 <<EOF
Node.js $required_version from .nvmrc, or another Node $required_major.x runtime, is required for './dev.sh $cmd'.
No local node executable was found.

Run:
  source "\$HOME/.nvm/nvm.sh" && nvm use

or install the Node.js version pinned in .nvmrc, then retry.
EOF
    exit 1
  fi

  current_version="$(node -p "process.versions.node" 2>/dev/null || true)"
  current_major="${current_version%%.*}"
  if [[ ! "$current_major" =~ ^[0-9]+$ || "$current_major" -ne "$required_major" ]]; then
    cat >&2 <<EOF
Node.js $required_version from .nvmrc, or another Node $required_major.x runtime, is required for './dev.sh $cmd'.
Current node: ${current_version:-unknown}

This project uses Node's built-in SQLite runtime, which requires Node 22+.

Run:
  source "\$HOME/.nvm/nvm.sh" && nvm use

or install the Node.js version pinned in .nvmrc, then retry.
EOF
    exit 1
  fi
}

list_simulator_pids() {
  pgrep -f "$PWD/.*/src/index.ts run|node --import tsx src/index.ts run" || true
}

write_simulator_pid_file() {
  local pids
  pids="$(list_simulator_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  mkdir -p "$simulator_dir"
  if [[ -n "$pids" ]]; then
    echo "$pids" >"$simulator_pid_file"
  else
    rm -f "$simulator_pid_file"
  fi
}

launch_simulator() {
  local launch_command
  launch_command="cd '$PWD' && pnpm --filter @planning-poker/simulator start >>'$simulator_log_file' 2>&1"

  if command -v setsid >/dev/null 2>&1; then
    setsid /bin/bash -lc "$launch_command" >/dev/null 2>&1 &
    return
  fi

  if command -v nohup >/dev/null 2>&1; then
    nohup /bin/bash -lc "$launch_command" >/dev/null 2>&1 &
    return
  fi

  echo "Cannot start simulator: neither setsid nor nohup is available." >&2
  exit 1
}

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

ensure_macos_podman_machine() {
  local machine_name connection_name

  if ! is_macos || ! command -v podman >/dev/null 2>&1; then
    return
  fi

  if podman info >/dev/null 2>&1; then
    return
  fi

  echo "Podman is not reachable. Checking the macOS Podman machine..."
  machine_name="$(podman machine list -q 2>/dev/null | sed -n '1p' | sed 's/\*$//' || true)"
  if [[ -z "$machine_name" ]]; then
    echo "No Podman machine found. Initializing and starting the default macOS Podman machine..."
    podman machine init --now
    machine_name="$(podman machine list -q 2>/dev/null | sed -n '1p' | sed 's/\*$//' || true)"
  else
    echo "Starting macOS Podman machine '$machine_name'..."
    podman machine start "$machine_name" || true
  fi

  if [[ -n "$machine_name" ]]; then
    connection_name="$(
      podman system connection list --format '{{range .}}{{.Name}}{{"\n"}}{{end}}' 2>/dev/null |
        sed -n "/^${machine_name}$/p; /^${machine_name}-root$/p" |
        sed -n '1p' || true
    )"
    if [[ -n "$connection_name" ]]; then
      podman system connection default "$connection_name" >/dev/null 2>&1 || true
    fi
  fi

  if ! podman info >/dev/null 2>&1 && [[ -n "$machine_name" ]]; then
    echo "Podman connection is still stale. Restarting macOS Podman machine '$machine_name'..."
    podman machine stop "$machine_name" >/dev/null 2>&1 || true
    podman machine start "$machine_name"
    podman system connection default "${connection_name:-$machine_name}" >/dev/null 2>&1 || true
  fi

  if ! podman info >/dev/null 2>&1; then
    cat >&2 <<EOF
Podman is installed, but the macOS Podman machine is still not reachable.

Try:
  podman machine list
  podman machine start
  podman system connection list

Then retry:
  ./dev.sh $cmd
EOF
    exit 1
  fi
}

run_podman_compose() {
  export APP_CONFIG_DIR="${APP_CONFIG_DIR:-$repo_root/config}"
  local active_compose_file="$compose_file"

  if [[ "${PACKAGED_STACK_NETWORK_MODE:-auto}" == "host" ]]; then
    active_compose_file="$compose_host_network_file"
  fi

  if command -v podman >/dev/null 2>&1; then
    ensure_macos_podman_machine
    podman compose -f "$active_compose_file" "$@"
    return
  fi

  if command -v podman-compose >/dev/null 2>&1; then
    podman-compose -f "$active_compose_file" "$@"
    return
  fi

  echo "Podman is required for stack commands. Install podman or podman-compose." >&2
  exit 1
}

run_podman_compose_with_network_fallback() {
  local requested_mode="${PACKAGED_STACK_NETWORK_MODE:-auto}"
  local status

  if [[ "$requested_mode" == "host" || "$requested_mode" == "bridge" ]]; then
    PACKAGED_STACK_NETWORK_MODE="$requested_mode" run_podman_compose "$@"
    return
  fi

  if PACKAGED_STACK_NETWORK_MODE=bridge run_podman_compose "$@"; then
    return
  fi
  status=$?

  cat >&2 <<'EOF'
The packaged stack could not start with the default Podman bridge network.
Retrying with host networking for this local test/dev run.

This fallback is intended for restricted local Linux environments where rootless
Podman cannot create a netavark bridge. The deployed VPS compose file still uses
the normal localhost port binding.
EOF

  PACKAGED_STACK_NETWORK_MODE=bridge run_podman_compose down --remove-orphans >/dev/null 2>&1 || true
  if PACKAGED_STACK_NETWORK_MODE=host run_podman_compose "$@"; then
    return
  fi

  return "$status"
}

run_packaged_stack_down() {
  local requested_mode="${PACKAGED_STACK_NETWORK_MODE:-auto}"

  if [[ "$requested_mode" == "host" || "$requested_mode" == "bridge" ]]; then
    PACKAGED_STACK_NETWORK_MODE="$requested_mode" run_podman_compose down "$@"
    return
  fi

  PACKAGED_STACK_NETWORK_MODE=host run_podman_compose down "$@" >/dev/null 2>&1 || true
  PACKAGED_STACK_NETWORK_MODE=bridge run_podman_compose down "$@"
}

cleanup_packaged_test_config() {
  if [[ -n "$packaged_test_config_dir" && -d "$packaged_test_config_dir" ]]; then
    rm -rf "$packaged_test_config_dir"
    packaged_test_config_dir=""
  fi
}

prepare_packaged_test_config() {
  if [[ -n "$packaged_test_config_dir" && -d "$packaged_test_config_dir" ]]; then
    export APP_CONFIG_DIR="$packaged_test_config_dir"
    return
  fi

  packaged_test_config_dir="$(mktemp -d)"
  cp config/allowed-domains.txt "$packaged_test_config_dir/allowed-domains.txt"
  mkdir -p "$packaged_test_config_dir/managed-branding"
  cat >"$packaged_test_config_dir/deployment.local.toml" <<'EOF'
[app]
base_url = "http://127.0.0.1:3001"
allowed_domains_path = "/app/config/allowed-domains.txt"

[admin]
username = "platform-admin"
password = "PlatformAdmin123!"
EOF
  export APP_CONFIG_DIR="$packaged_test_config_dir"
}

uses_packaged_test_config() {
  case "$cmd" in
    test:e2e | test:e2e:perf | test:e2e:sim | test:e2e:sim:matrix21 | phase:p2:verify | phase:p3:verify)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_deployment_local_config() {
  if [[ -f "$local_deployment_config" ]]; then
    return 1
  fi

  if [[ -f "$tracked_deployment_config" ]]; then
    cp "$tracked_deployment_config" "$local_deployment_config"
    echo "Created $local_deployment_config from $tracked_deployment_config."
    return 0
  fi

  if [[ -f config/deployment.sample.toml ]]; then
    cp config/deployment.sample.toml "$local_deployment_config"
    echo "Created $local_deployment_config from config/deployment.sample.toml."
    return 0
  fi

  echo "No deployment config template found." >&2
  exit 1
}

toml_section_value() {
  local config_path="$1"
  local section="$2"
  local field="$3"

  awk -F '=' -v section="$section" -v field="$field" '
    $0 ~ "^[[:space:]]*\\[" section "\\][[:space:]]*$" { in_section=1; next }
    $0 ~ "^[[:space:]]*\\[" { in_section=0 }
    in_section && $1 ~ "^[[:space:]]*" field "[[:space:]]*$" {
      value=$2
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "$config_path"
}

ensure_local_super_admin_credentials() {
  ensure_deployment_local_config || true

  local username password
  username="$(toml_section_value "$local_deployment_config" "admin" "username")"
  password="$(toml_section_value "$local_deployment_config" "admin" "password")"

  if [[ "${#username}" -ge 2 && "${#password}" -ge 8 ]]; then
    return
  fi

  cat >&2 <<EOF
Super-admin credentials are not configured.

Open and edit:
  $local_deployment_config

Set:
  [admin].username
  [admin].password

Then save the file and rerun:
  ./dev.sh $cmd

The password must be at least 8 characters. The repository does not ship default
super-admin credentials for safety.
EOF
  exit 1
}

fresh_stack_up() {
  ensure_local_super_admin_credentials
  run_packaged_stack_down --remove-orphans || true
  run_podman_compose build --no-cache
  run_podman_compose_with_network_fallback up --force-recreate
}

wait_for_stack_health() {
  for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for the packaged stack to become healthy." >&2
  exit 1
}

project_version() {
  awk -F '"' '$2 == "version" { print $4; exit }' package.json
}

git_commit() {
  git rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

print_project_version() {
  echo "OpaVoting $(project_version)"
  echo "Git commit: $(git_commit)"
  echo "Release status: alpha / public v$(project_version)"
}

ensure_packaged_stack() {
  if uses_packaged_test_config; then
    prepare_packaged_test_config
  else
    ensure_local_super_admin_credentials
  fi
  DATA_DIR="$isolated_stack_data_dir" run_podman_compose_with_network_fallback up -d --build
  wait_for_stack_health
}

if is_node_dependent_command "$cmd"; then
  require_node_runtime
fi

case "$cmd" in
  help)
    cat <<'EOF'
Usage: ./dev.sh <command>

Local Node requirement:
  Node.js 22.22.2 from .nvmrc, or another Node 22.x runtime, is required for dependency, build, stack:up, test, and simulator commands.
  The pinned version lives in .nvmrc. ./dev.sh runs nvm use before those commands when nvm is installed.

Setup / Build
  ./dev.sh help         Show this help
  ./dev.sh version      Show project version and current git commit
  ./dev.sh deps         Install workspace dependencies
  ./dev.sh build        Build all workspace packages
  ./dev.sh lint         Run non-mutating lint/type checks
  ./dev.sh typecheck    Run TypeScript checks for the whole workspace

Tests
  ./dev.sh test:scripts Run shell helper command contract checks
  ./dev.sh test:unit    Run backend unit tests
  ./dev.sh test:int     Run backend integration tests
  ./dev.sh test:web     Run frontend/web tests
  ./dev.sh test:web:perf Run frontend perf-focused tests
  ./dev.sh test:e2e     Run packaged browser e2e flow
  ./dev.sh test:e2e:perf Run simulator-backed frontend perf checks
  ./dev.sh test:e2e:sim Run simulator-backed board layout e2e flow
  ./dev.sh test:e2e:sim:matrix21 Run strict 21-person simulator viewport matrix
  ./dev.sh phase:p2:verify Run the broad Phase 2 verification batch
  ./dev.sh phase:p3:verify Run the machine-heavy Phase 3 capacity validation batch
  ./dev.sh test:full    Run the main verification suite; the heavy sim e2e suite stays separate

Packaged stack environment:
  PACKAGED_STACK_NETWORK_MODE=auto|bridge|host
                       Default: auto. Local packaged stack commands try the normal
                       Podman bridge network first, then host networking if bridge
                       creation is unsupported. VPS deployment remains unchanged.

Stack
  ./dev.sh stack:up     Tear down stale containers, rebuild with no cache, and start the packaged Podman stack
  ./dev.sh stack:down   Stop the packaged Podman stack
  ./dev.sh stack:verify Check packaged stack health on localhost:3001

Simulator
  ./dev.sh sim:seed     Seed 950 deterministic bot users and 12 demo teams
  ./dev.sh sim:up       Start the live bot simulator as a long-running helper
  ./dev.sh sim:down     Stop all live simulator processes
  ./dev.sh sim:status   Show whether the simulator is currently running

See README.md for quick examples and simulator workflow notes.
EOF
    ;;
  version)
    print_project_version
    ;;
  deps)
    pnpm install
    ;;
  build)
    pnpm -r build
    ;;
  lint)
    pnpm -r lint
    ;;
  typecheck)
    pnpm -r typecheck
    ;;
  test:scripts)
    ./scripts/test-shell-commands.sh
    ;;
  test:unit)
    pnpm --filter @planning-poker/api test:unit
    ;;
  test:int)
    pnpm --filter @planning-poker/api test:int
    ;;
  test:web)
    pnpm --filter @planning-poker/web test:web
    ;;
  test:web:perf)
    pnpm --filter @planning-poker/web test:web:perf
    ;;
  test:e2e)
    ./scripts/test-e2e.sh
    ;;
  test:e2e:perf)
    ./dev.sh sim:down >/dev/null 2>&1 || true
    ./dev.sh stack:down >/dev/null 2>&1 || true
    ensure_packaged_stack
    trap './dev.sh sim:down >/dev/null 2>&1 || true; ./dev.sh stack:down >/dev/null 2>&1 || true; cleanup_packaged_test_config' EXIT
    ./dev.sh sim:seed
    SIMULATOR_SKIP_BOOTSTRAP=1 ./dev.sh sim:up
    pnpm --filter @planning-poker/web test:e2e:perf
    ;;
  test:e2e:sim)
    ./dev.sh sim:down >/dev/null 2>&1 || true
    ./dev.sh stack:down >/dev/null 2>&1 || true
    ensure_packaged_stack
    trap './dev.sh sim:down >/dev/null 2>&1 || true; ./dev.sh stack:down >/dev/null 2>&1 || true; cleanup_packaged_test_config' EXIT
    ./dev.sh sim:seed
    SIMULATOR_SKIP_BOOTSTRAP=1 ./dev.sh sim:up
    pnpm --filter @planning-poker/web test:e2e:sim
    ;;
  test:e2e:sim:matrix21)
    ./dev.sh sim:down >/dev/null 2>&1 || true
    ./dev.sh stack:down >/dev/null 2>&1 || true
    ensure_packaged_stack
    trap './dev.sh sim:down >/dev/null 2>&1 || true; ./dev.sh stack:down >/dev/null 2>&1 || true; cleanup_packaged_test_config' EXIT
    ./dev.sh sim:seed
    SIMULATOR_SKIP_BOOTSTRAP=1 ./dev.sh sim:up
    pnpm --filter @planning-poker/web test:e2e:sim:matrix21
    ;;
  phase:p2:verify)
    ./dev.sh typecheck
    ./dev.sh test:unit
    ./dev.sh test:int
    ./dev.sh test:web
    ./dev.sh test:web:perf
    ./dev.sh test:e2e
    ./dev.sh test:e2e:perf
    ./dev.sh test:e2e:sim
    ./dev.sh test:e2e:sim:matrix21
    ;;
  phase:p3:verify)
    ./dev.sh sim:down >/dev/null 2>&1 || true
    ./dev.sh stack:down >/dev/null 2>&1 || true
    ensure_packaged_stack
    trap './dev.sh sim:down >/dev/null 2>&1 || true; ./dev.sh stack:down >/dev/null 2>&1 || true; cleanup_packaged_test_config' EXIT
    pnpm --filter @planning-poker/simulator test
    pnpm --filter @planning-poker/api test:int
    pnpm --filter @planning-poker/simulator phase3:verify
    ;;
  test:full)
    ./dev.sh test:scripts
    ./dev.sh test:unit
    ./dev.sh test:int
    ./dev.sh test:web
    pnpm --filter @planning-poker/simulator test
    ;;
  stack:up)
    fresh_stack_up
    ;;
  stack:down)
    run_packaged_stack_down
    ;;
  stack:verify)
    curl -fsS http://localhost:3001/health
    ;;
  sim:seed)
    pnpm --filter @planning-poker/simulator seed
    ;;
  sim:up)
    mkdir -p "$simulator_dir"
    existing_pids="$(list_simulator_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    if [[ -n "$existing_pids" ]]; then
      write_simulator_pid_file
      echo "Simulator already running with PID(s) $existing_pids"
      exit 0
    fi
    launch_simulator
    sleep 1
    write_simulator_pid_file
    if [[ -f "$simulator_pid_file" ]]; then
      echo "Simulator started with PID(s) $(cat "$simulator_pid_file")"
    else
      echo "Simulator launch requested, but no live simulator process was detected yet."
    fi
    echo "Log: $simulator_log_file"
    ;;
  sim:down)
    pids="$(list_simulator_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    if [[ -z "$pids" ]]; then
      rm -f "$simulator_pid_file"
      echo "Simulator is not running."
      exit 0
    fi
    for pid in $pids; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        pkill -TERM -P "$pid" >/dev/null 2>&1 || true
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done
    sleep 1
    remaining_pids="$(list_simulator_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    if [[ -n "$remaining_pids" ]]; then
      for pid in $remaining_pids; do
        pkill -KILL -P "$pid" >/dev/null 2>&1 || true
        kill -KILL "$pid" >/dev/null 2>&1 || true
      done
    fi
    rm -f "$simulator_pid_file"
    echo "Stopped simulator PID(s) $pids"
    ;;
  sim:status)
    pids="$(list_simulator_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    if [[ -n "$pids" ]]; then
      write_simulator_pid_file
      echo "Simulator running with PID(s) $pids"
      exit 0
    fi
    rm -f "$simulator_pid_file"
    echo "Simulator is not running."
    exit 1
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    exit 1
    ;;
esac
