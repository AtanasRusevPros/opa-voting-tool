#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

compose_file="infra/containers/compose.yaml"
compose_host_network_file="infra/containers/compose.host-network.yaml"
isolated_stack_data_dir="/tmp/planning-poker-packaged-test-data"
isolated_config_dir=""

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
    cat >&2 <<'EOF'
Podman is installed, but the macOS Podman machine is still not reachable.

Try:
  podman machine list
  podman machine start
  podman system connection list

Then retry the packaged e2e command.
EOF
    exit 1
  fi
}

run_podman_compose() {
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

  echo "Podman is required for e2e tests." >&2
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
The packaged e2e stack could not start with the default Podman bridge network.
Retrying with host networking for this local test run.

This fallback is intended for restricted local Linux environments where rootless
Podman cannot create a netavark bridge. The deployed VPS compose file still uses
the normal localhost port binding.
EOF

  PACKAGED_STACK_NETWORK_MODE=bridge run_podman_compose down -v >/dev/null 2>&1 || true
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

cleanup() {
  run_packaged_stack_down -v >/dev/null 2>&1 || true
  if [[ -n "$isolated_config_dir" && -d "$isolated_config_dir" ]]; then
    rm -rf "$isolated_config_dir"
  fi
}

trap cleanup EXIT

prepare_isolated_config() {
  isolated_config_dir="$(mktemp -d)"
  cp config/allowed-domains.txt "$isolated_config_dir/allowed-domains.txt"
  mkdir -p "$isolated_config_dir/managed-branding"
  cat >"$isolated_config_dir/deployment.local.toml" <<'EOF'
[app]
base_url = "http://127.0.0.1:3001"
allowed_domains_path = "/app/config/allowed-domains.txt"

[admin]
username = "platform-admin"
password = "PlatformAdmin123!"
EOF
  export APP_CONFIG_DIR="$isolated_config_dir"
}

cleanup
prepare_isolated_config
DATA_DIR="$isolated_stack_data_dir" E2E_DEBUG_CODES=1 run_podman_compose_with_network_fallback up -d --build

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
    if PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm --filter @planning-poker/web test:e2e; then
      exit 0
    fi
    echo "Packaged e2e failed; recent planning-poker container logs:" >&2
    run_podman_compose logs --tail=200 planning-poker >&2 || true
    exit 1
  fi
  sleep 1
done

echo "Timed out waiting for the packaged stack to become healthy." >&2
exit 1
