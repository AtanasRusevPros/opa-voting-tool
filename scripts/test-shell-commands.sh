#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

local_deployment_config="config/deployment.local.toml"
local_operator_config="config/deploy.local.toml"
saved_local_config=""
saved_operator_config=""
backup_prune_test_dir=""
fake_host_dir=""
fake_bin_dir=""

restore_local_deployment_config() {
  if [[ -n "$fake_host_dir" && -d "$fake_host_dir" ]]; then
    rm -rf "$fake_host_dir"
  fi

  if [[ -n "$backup_prune_test_dir" && -d "$backup_prune_test_dir" ]]; then
    rm -rf "$backup_prune_test_dir"
  fi

  if [[ -n "$saved_local_config" && -f "$saved_local_config" ]]; then
    cp "$saved_local_config" "$local_deployment_config"
    rm -f "$saved_local_config"
  else
    rm -f "$local_deployment_config"
  fi

  if [[ -n "$saved_operator_config" && -f "$saved_operator_config" ]]; then
    cp "$saved_operator_config" "$local_operator_config"
    rm -f "$saved_operator_config"
  else
    rm -f "$local_operator_config"
  fi
}

if [[ -f "$local_deployment_config" ]]; then
  saved_local_config="$(mktemp)"
  cp "$local_deployment_config" "$saved_local_config"
fi

if [[ -f "$local_operator_config" ]]; then
  saved_operator_config="$(mktemp)"
  cp "$local_operator_config" "$saved_operator_config"
fi

trap restore_local_deployment_config EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "Missing expected text for $label: $needle" >&2
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"

  if [[ "$haystack" == *"$needle"* ]]; then
    echo "Unexpected text for $label: $needle" >&2
    exit 1
  fi
}

assert_case_label() {
  local script_path="$1"
  local command="$2"
  local label="$3"

  if ! grep -F "  $command)" "$script_path" >/dev/null; then
    echo "Missing case dispatcher for $label command: $command" >&2
    exit 1
  fi
}

setup_fake_host() {
  local mode="${1:-systemd}"
  fake_host_dir="$(mktemp -d)"
  fake_bin_dir="$fake_host_dir/bin"
  mkdir -p "$fake_bin_dir" "$fake_host_dir/home" "$fake_host_dir/xdg"

  cat >"$fake_bin_dir/podman" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${FAKE_STATE_DIR:?}"
mkdir -p "$state_dir"
log_file="$state_dir/podman.log"
echo "$*" >>"$log_file"
subcommand="${1:-}"
shift || true

container_id="${FAKE_CONTAINER_ID:-fake-container}"
container_status_file="$state_dir/container-status"
container_exit_file="$state_dir/container-exit"
container_error_file="$state_dir/container-error"
restart_marker="$state_dir/restarted"

read_status() {
  if [[ -f "$container_status_file" ]]; then
    cat "$container_status_file"
    return
  fi
  echo "${FAKE_CONTAINER_STATUS:-running}"
}

case "$subcommand" in
  compose)
    while [[ "$#" -gt 0 ]]; do
      case "$1" in
        -f)
          shift 2
          ;;
        up)
          printf 'running\n' >"$container_status_file"
          touch "$restart_marker"
          exit 0
          ;;
        restart)
          printf 'running\n' >"$container_status_file"
          touch "$restart_marker"
          exit 0
          ;;
        down)
          printf 'missing\n' >"$container_status_file"
          exit 0
          ;;
        build|ps)
          exit 0
          ;;
        logs)
          printf '%s\n' "${FAKE_PODMAN_LOG_OUTPUT:-Simulated podman compose log output}"
          exit 0
          ;;
        *)
          shift
          ;;
      esac
    done
    ;;
  ps)
    status="$(read_status)"
    if [[ "$status" == "missing" ]]; then
      exit 0
    fi
    if printf '%s ' "$*" | grep -F -- '--format {{.ID}} {{.Names}}' >/dev/null; then
      printf '%s %s\n' "$container_id" "planning-poker"
    else
      printf '%s\n' "$container_id"
    fi
    ;;
  inspect)
    status="$(read_status)"
    if [[ "$status" == "missing" ]]; then
      exit 1
    fi
    exit_code="0"
    error_text=""
    [[ -f "$container_exit_file" ]] && exit_code="$(cat "$container_exit_file")"
    [[ -f "$container_error_file" ]] && error_text="$(cat "$container_error_file")"
    printf '%s|%s|%s|/planning-poker\n' "$status" "$exit_code" "$error_text"
    ;;
  logs)
    printf '%s\n' "${FAKE_PODMAN_LOG_OUTPUT:-Simulated podman log output}"
    ;;
  exec)
    printf '{}\n'
    ;;
  volume)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
EOF
  chmod +x "$fake_bin_dir/podman"

  cat >"$fake_bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${FAKE_STATE_DIR:?}"
out_file=""
write_format=""
url=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -o)
      out_file="$2"
      shift 2
      ;;
    -w)
      write_format="$2"
      shift 2
      ;;
    --max-time)
      shift 2
      ;;
    --silent|--show-error|-sS|-fsS|-f|-S)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

select_result() {
  local default_result="$1"
  local env_name="$2"
  local value="${!env_name:-$default_result}"
  if [[ "${FAKE_HEALTH_RECOVER_ON_RESTART:-0}" == "1" && -f "$state_dir/restarted" && "$env_name" == "FAKE_LOCAL_HEALTH_RESULT" ]]; then
    value='200|{"ok":true,"checks":{"database":"ok"}}|0'
  fi
  printf '%s' "$value"
}

if [[ "$url" == *"127.0.0.1:3001/health"* ]]; then
  result="$(select_result '200|{"ok":true,"checks":{"database":"ok"}}|0' "FAKE_LOCAL_HEALTH_RESULT")"
elif [[ "$url" == "http://127.0.0.1:3001/"* ]]; then
  result="${FAKE_LOCAL_WEB_RESULT:-200|<html>ok</html>|0}"
else
  result="$(select_result '200|{"ok":true}|0' "FAKE_PUBLIC_HEALTH_RESULT")"
fi

IFS='|' read -r http_code body curl_exit <<<"$result"
if [[ -n "$out_file" ]]; then
  printf '%s' "$body" >"$out_file"
else
  printf '%s' "$body"
fi
if [[ -n "$write_format" ]]; then
  printf '%s' "$http_code"
fi
if [[ "$curl_exit" != "0" ]]; then
  exit "$curl_exit"
fi
EOF
  chmod +x "$fake_bin_dir/curl"

  cat >"$fake_bin_dir/crontab" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${FAKE_STATE_DIR:?}"
crontab_file="$state_dir/crontab"
if [[ "${1:-}" == "-l" ]]; then
  [[ -f "$crontab_file" ]] || exit 1
  cat "$crontab_file"
  exit 0
fi
cp "$1" "$crontab_file"
EOF
  chmod +x "$fake_bin_dir/crontab"

  cat >"$fake_bin_dir/loginctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${FAKE_STATE_DIR:?}"
linger_file="$state_dir/linger"
case "${1:-}" in
  enable-linger)
    printf 'yes\n' >"$linger_file"
    ;;
  show-user)
    if [[ -f "$linger_file" ]]; then
      cat "$linger_file"
    else
      printf 'no\n'
    fi
    ;;
esac
EOF
  chmod +x "$fake_bin_dir/loginctl"

  if [[ "$mode" == "systemd" ]]; then
    cat >"$fake_bin_dir/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${FAKE_STATE_DIR:?}"
mkdir -p "$state_dir/systemd"
if [[ "${1:-}" == "--user" && "${2:-}" == "--version" ]]; then
  printf 'systemd 255\n'
  exit 0
fi
if [[ "${1:-}" == "--user" && "${2:-}" == "daemon-reload" ]]; then
  exit 0
fi
if [[ "${1:-}" == "--user" && "${2:-}" == "enable" ]]; then
  shift 3
  while [[ "$#" -gt 0 ]]; do
    touch "$state_dir/systemd/$1"
    shift
  done
  exit 0
fi
if [[ "${1:-}" == "--user" && "${2:-}" == "disable" ]]; then
  shift 3
  while [[ "$#" -gt 0 ]]; do
    rm -f "$state_dir/systemd/$1"
    shift
  done
  exit 0
fi
if [[ "${1:-}" == "--user" && "${2:-}" == "status" ]]; then
  exit 0
fi
exit 0
EOF
    chmod +x "$fake_bin_dir/systemctl"
  else
    cat >"$fake_bin_dir/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
    chmod +x "$fake_bin_dir/systemctl"
  fi
}

bash -n dev.sh
bash -n deploy.sh

dev_help="$(./dev.sh help)"
deploy_help="$(./deploy.sh help)"

assert_contains "$dev_help" "PACKAGED_STACK_NETWORK_MODE=auto|bridge|host" "dev.sh packaged stack network mode help"
assert_contains "$dev_help" "VPS deployment remains unchanged." "dev.sh packaged stack network mode help"

dev_commands=(
  "help"
  "version"
  "deps"
  "build"
  "lint"
  "typecheck"
  "test:scripts"
  "test:unit"
  "test:int"
  "test:web"
  "test:web:perf"
  "test:e2e"
  "test:e2e:perf"
  "test:e2e:sim"
  "test:e2e:sim:matrix21"
  "phase:p2:verify"
  "phase:p3:verify"
  "test:full"
  "stack:up"
  "stack:down"
  "stack:verify"
  "sim:seed"
  "sim:up"
  "sim:down"
  "sim:status"
)

for command in "${dev_commands[@]}"; do
  assert_contains "$dev_help" "./dev.sh $command" "dev.sh help"
  assert_case_label "dev.sh" "$command" "dev.sh"
done

deploy_commands=(
  "version"
  "up"
  "down"
  "restart"
  "rebuild"
  "update"
  "ps"
  "health"
  "public-health"
  "diagnose"
  "logs"
  "logs:follow"
  "startup:status"
  "startup:enable"
  "startup:disable"
  "watchdog:status"
  "watchdog:run"
  "incidents"
  "incidents:ack"
  "caddy:validate"
  "caddy:reload"
  "caddy:status"
  "caddy:logs"
  "config:migrate"
  "config:edit"
  "domains:edit"
  "backup"
  "backup:list"
  "backup:prune"
  "restore <file>"
)

for command in "${deploy_commands[@]}"; do
  assert_contains "$deploy_help" "./deploy.sh $command" "deploy.sh help"
  assert_case_label "deploy.sh" "${command%% *}" "deploy.sh"
done

dev_version_output="$(./dev.sh version)"
assert_contains "$dev_version_output" "OpaVoting 0.1.0" "dev.sh version"
assert_contains "$dev_version_output" "Git commit:" "dev.sh version"

deploy_version_output="$(./deploy.sh version)"
assert_contains "$deploy_version_output" "OpaVoting 0.1.0" "deploy.sh version"
assert_contains "$deploy_version_output" "Git commit:" "deploy.sh version"

if dev_unknown_output="$(./dev.sh __missing_command__ 2>&1)"; then
  echo "dev.sh accepted an unknown command." >&2
  exit 1
fi
assert_contains "$dev_unknown_output" "Unknown command: __missing_command__" "dev.sh unknown command"

if deploy_restore_output="$(./deploy.sh restore /tmp/opa-voting-tool-missing-backup.tar.gz 2>&1)"; then
  echo "deploy.sh restore accepted a missing archive." >&2
  exit 1
fi
assert_contains "$deploy_restore_output" "Backup archive not found" "deploy.sh restore missing archive"
assert_not_contains "$deploy_restore_output" "Unknown command" "deploy.sh restore command dispatch"

backup_prune_test_dir="$(mktemp -d)"
touch -d '2026-05-01 00:00:00 UTC' "$backup_prune_test_dir/planning-poker-backup-old.tar.gz"
touch -d '2026-05-02 00:00:00 UTC' "$backup_prune_test_dir/planning-poker-backup-middle.tar.gz"
touch -d '2026-05-03 00:00:00 UTC' "$backup_prune_test_dir/planning-poker-backup-new.tar.gz"
deploy_prune_dry_run_output="$(BACKUP_DIR="$backup_prune_test_dir" BACKUP_PRUNE_KEEP=2 BACKUP_PRUNE_DRY_RUN=1 ./deploy.sh backup:prune)"
assert_contains "$deploy_prune_dry_run_output" "Would delete:" "deploy.sh backup:prune dry-run"
assert_contains "$deploy_prune_dry_run_output" "planning-poker-backup-old.tar.gz" "deploy.sh backup:prune dry-run oldest file"
deploy_prune_output="$(BACKUP_DIR="$backup_prune_test_dir" BACKUP_PRUNE_KEEP=2 ./deploy.sh backup:prune)"
assert_contains "$deploy_prune_output" "Pruned 1 backup(s); kept newest 2 backup(s)." "deploy.sh backup:prune"
if [[ -f "$backup_prune_test_dir/planning-poker-backup-old.tar.gz" ]]; then
  echo "deploy.sh backup:prune kept the oldest backup unexpectedly." >&2
  exit 1
fi
if [[ ! -f "$backup_prune_test_dir/planning-poker-backup-middle.tar.gz" || ! -f "$backup_prune_test_dir/planning-poker-backup-new.tar.gz" ]]; then
  echo "deploy.sh backup:prune deleted one of the newest backups unexpectedly." >&2
  exit 1
fi

cat >"$local_deployment_config" <<'EOF'
[app]
base_url = "https://vote.example.com"

[admin]
username = "platform-admin"
password = "PlatformAdmin123!"
display_name = "Platform Admin"
EOF

setup_fake_host systemd
fake_state_dir="$fake_host_dir/state"
mkdir -p "$fake_state_dir"
cat >"$local_operator_config" <<EOF
[startup]
backend = "auto"

[watchdog]
enabled = true
interval_minutes = 1

[incidents]
dir = "$(printf '%s' "$fake_host_dir/incidents" | sed 's/\\/\\\\/g')"
summary_cap_mb = 5

[health]
local_url = ""
public_url = ""
EOF
deploy_up_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  APP_URL="https://vote.example.com" \
  HEALTH_WAIT_RETRIES=2 \
  HEALTH_WAIT_SLEEP_SECONDS=0 \
  ./deploy.sh up
)"
assert_contains "$deploy_up_output" "Startup enabled automatically: yes" "deploy.sh up auto-enable"
assert_contains "$deploy_up_output" "Startup backend effective: systemd" "deploy.sh up auto-enable backend"
if [[ ! -f "$fake_host_dir/xdg/systemd/user/opavotingtool-stack.service" ]]; then
  echo "deploy.sh up did not install the systemd stack unit." >&2
  exit 1
fi
if [[ ! -f "$fake_host_dir/xdg/systemd/user/opavotingtool-watchdog.timer" ]]; then
  echo "deploy.sh up did not install the systemd watchdog timer." >&2
  exit 1
fi

deploy_startup_disable_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  ./deploy.sh startup:disable
)"
assert_contains "$deploy_startup_disable_output" "Keep-alive disabled." "deploy.sh startup:disable"
assert_contains "$deploy_startup_disable_output" "Selected backend: disabled" "deploy.sh startup:disable status"
assert_contains "$(cat "$local_operator_config")" 'backend = "disabled"' "deploy.sh startup:disable config"
assert_contains "$(cat "$local_operator_config")" 'enabled = false' "deploy.sh startup:disable config watchdog"

deploy_startup_enable_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  ./deploy.sh startup:enable
)"
assert_contains "$deploy_startup_enable_output" "Keep-alive enabled with backend: systemd" "deploy.sh startup:enable"
assert_contains "$deploy_startup_enable_output" "Effective backend: systemd" "deploy.sh startup:enable status"
assert_contains "$(cat "$local_operator_config")" 'backend = "auto"' "deploy.sh startup:enable config"
assert_contains "$(cat "$local_operator_config")" 'enabled = true' "deploy.sh startup:enable config watchdog"

deploy_health_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  APP_URL="https://vote.example.com" \
  ./deploy.sh health
)"
assert_contains "$deploy_health_output" "Local API: true" "deploy.sh health local api"
assert_contains "$deploy_health_output" "Public health: true" "deploy.sh health public"
assert_contains "$deploy_health_output" "Watchdog enabled: true" "deploy.sh health watchdog"

rm -rf "$fake_host_dir"
fake_host_dir=""
fake_bin_dir=""

setup_fake_host cron
fake_state_dir="$fake_host_dir/state"
mkdir -p "$fake_state_dir"
cat >"$local_operator_config" <<EOF
[startup]
backend = "auto"

[watchdog]
enabled = true
interval_minutes = 1

[incidents]
dir = "$(printf '%s' "$fake_host_dir/incidents" | sed 's/\\/\\\\/g')"
summary_cap_mb = 5

[health]
local_url = ""
public_url = ""
EOF
deploy_cron_enable_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  ./deploy.sh startup:enable
)"
assert_contains "$deploy_cron_enable_output" "Keep-alive enabled with backend: cron" "deploy.sh startup:enable cron"
assert_contains "$deploy_cron_enable_output" "Effective backend: cron" "deploy.sh startup:enable cron status"
if [[ ! -f "$fake_state_dir/crontab" ]]; then
  echo "deploy.sh startup:enable did not install cron keep-alive." >&2
  exit 1
fi
assert_contains "$(cat "$fake_state_dir/crontab")" "./deploy.sh watchdog:run" "deploy.sh cron watchdog entry"

deploy_watchdog_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  APP_URL="https://vote.example.com" \
  HEALTH_WAIT_RETRIES=2 \
  HEALTH_WAIT_SLEEP_SECONDS=0 \
  FAKE_LOCAL_HEALTH_RESULT='503|{"ok":false,"errorCode":"api_unhealthy","error":"boom"}|0' \
  FAKE_HEALTH_RECOVER_ON_RESTART=1 \
  ./deploy.sh watchdog:run
)"
assert_contains "$deploy_watchdog_output" "Watchdog incident recorded: api_unhealthy" "deploy.sh watchdog:run incident"
if [[ ! -f "$fake_host_dir/incidents/latest.json" ]]; then
  echo "deploy.sh watchdog:run did not write the latest incident summary." >&2
  exit 1
fi
assert_contains "$(cat "$fake_host_dir/incidents/counters.json")" '"api_unhealthy":1' "deploy.sh watchdog counters"
if [[ -f "$fake_host_dir/incidents/unacknowledged" ]]; then
  echo "deploy.sh watchdog:run kept the unacknowledged marker after successful recovery." >&2
  exit 1
fi

deploy_incidents_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  ./deploy.sh incidents
)"
assert_contains "$deploy_incidents_output" "Incident status: acknowledged retained incident" "deploy.sh incidents status"
assert_contains "$deploy_incidents_output" "Failure counters:" "deploy.sh incidents counters"

deploy_ack_output="$(
  PATH="$fake_bin_dir:$PATH" \
  HOME="$fake_host_dir/home" \
  XDG_CONFIG_HOME="$fake_host_dir/xdg" \
  FAKE_STATE_DIR="$fake_state_dir" \
  ./deploy.sh incidents:ack
)"
assert_contains "$deploy_ack_output" "Acknowledged current incident." "deploy.sh incidents:ack"
if [[ -f "$fake_host_dir/incidents/unacknowledged" ]]; then
  echo "deploy.sh incidents:ack kept the unacknowledged marker unexpectedly." >&2
  exit 1
fi

rm -f "$local_deployment_config"
if deploy_missing_credentials_output="$(./deploy.sh up 2>&1)"; then
  echo "deploy.sh up accepted missing super-admin credentials." >&2
  exit 1
fi
assert_contains "$deploy_missing_credentials_output" "Super-admin credentials are not configured." "deploy.sh missing credentials"
assert_contains "$deploy_missing_credentials_output" "config/deployment.local.toml" "deploy.sh missing credentials config path"
assert_not_contains "$deploy_missing_credentials_output" "Podman is required" "deploy.sh missing credentials preflight"

rm -f "$local_deployment_config"
if dev_missing_credentials_output="$(./dev.sh stack:up 2>&1)"; then
  echo "dev.sh stack:up accepted missing super-admin credentials." >&2
  exit 1
fi
assert_contains "$dev_missing_credentials_output" "Super-admin credentials are not configured." "dev.sh missing credentials"
assert_contains "$dev_missing_credentials_output" "config/deployment.local.toml" "dev.sh missing credentials config path"
assert_not_contains "$dev_missing_credentials_output" "Podman is required" "dev.sh missing credentials preflight"

echo "Shell command contract checks passed."
