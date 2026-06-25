#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

cmd="${1:-help}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="$repo_root/infra/containers/compose.yaml"
service_name="planning-poker"
default_local_health_url="http://127.0.0.1:3001/health"
tracked_deployment_config="config/deployment.toml"
local_deployment_config="config/deployment.local.toml"
tracked_operator_config="config/deploy.toml"
local_operator_config="config/deploy.local.toml"
backup_dir="${BACKUP_DIR:-$repo_root/../backups}"
data_volume_name="${DATA_VOLUME_NAME:-containers_planning_poker_data}"
tail_lines="${TAIL:-200}"
backup_prune_keep="${BACKUP_PRUNE_KEEP:-20}"
health_wait_retries="${HEALTH_WAIT_RETRIES:-60}"
health_wait_sleep_seconds="${HEALTH_WAIT_SLEEP_SECONDS:-1}"
stack_unit_name="${STACK_UNIT_NAME:-opavotingtool-stack.service}"
watchdog_service_name="${WATCHDOG_SERVICE_NAME:-opavotingtool-watchdog.service}"
watchdog_timer_name="${WATCHDOG_TIMER_NAME:-opavotingtool-watchdog.timer}"
planned_action_ttl_seconds="${PLANNED_ACTION_TTL_SECONDS:-180}"
auto_enable_keepalive="${DEPLOY_AUTO_ENABLE_KEEPALIVE:-1}"
caddy_service_name="${CADDY_SERVICE_NAME:-caddy}"

startup_backend_selected=""
effective_startup_backend=""
watchdog_enabled="true"
watchdog_interval_minutes="1"
incident_dir=""
incident_summary_cap_mb="5"
configured_local_health_url=""
configured_public_url=""

cd "$repo_root"

active_deployment_config() {
  if [[ -f "$local_deployment_config" ]]; then
    echo "$local_deployment_config"
    return
  fi

  echo "$tracked_deployment_config"
}

active_operator_config() {
  if [[ -f "$local_operator_config" ]]; then
    echo "$local_operator_config"
    return
  fi

  echo "$tracked_operator_config"
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

ensure_operator_local_config() {
  if [[ -f "$local_operator_config" ]]; then
    return 1
  fi

  cp "$tracked_operator_config" "$local_operator_config"
  echo "Created $local_operator_config from $tracked_operator_config."
  return 0
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

quote_toml() {
  local escaped
  escaped="$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '"%s"' "$escaped"
}

normalize_bool() {
  local value="${1,,}"
  case "$value" in
    1 | true | yes | on)
      echo "true"
      ;;
    *)
      echo "false"
      ;;
  esac
}

normalize_positive_int() {
  local value="$1"
  local fallback="$2"
  if [[ "$value" =~ ^[0-9]+$ && "$value" -ge 1 ]]; then
    echo "$value"
    return
  fi
  echo "$fallback"
}

resolve_repo_path() {
  local target="$1"
  if [[ "$target" = /* ]]; then
    echo "$target"
    return
  fi
  echo "$repo_root/$target"
}

operator_config_value() {
  local section="$1"
  local field="$2"
  local fallback="$3"
  local value
  value="$(toml_section_value "$(active_operator_config)" "$section" "$field")"
  if [[ -n "$value" ]]; then
    echo "$value"
    return
  fi
  echo "$fallback"
}

load_operator_settings() {
  startup_backend_selected="$(operator_config_value "startup" "backend" "auto")"
  watchdog_enabled="$(normalize_bool "$(operator_config_value "watchdog" "enabled" "true")")"
  watchdog_interval_minutes="$(normalize_positive_int "$(operator_config_value "watchdog" "interval_minutes" "1")" "1")"
  incident_summary_cap_mb="$(normalize_positive_int "$(operator_config_value "incidents" "summary_cap_mb" "5")" "5")"
  incident_dir="$(resolve_repo_path "$(operator_config_value "incidents" "dir" "../incidents")")"
  configured_local_health_url="$(operator_config_value "health" "local_url" "")"
  configured_public_url="$(operator_config_value "health" "public_url" "")"
  effective_startup_backend="$(determine_effective_startup_backend "$startup_backend_selected")"
}

write_operator_config() {
  local backend="$1"
  local watchdog="$2"
  local interval="$3"
  local incidents_path="$4"
  local summary_cap="$5"
  local local_url="$6"
  local public_url_value="$7"

  cat >"$local_operator_config" <<EOF
# Ignored deploy/operator supervision override.
# Generated or updated by deploy.sh.

[startup]
backend = $(quote_toml "$backend")

[watchdog]
enabled = $watchdog
interval_minutes = $interval

[incidents]
dir = $(quote_toml "$incidents_path")
summary_cap_mb = $summary_cap

[health]
local_url = $(quote_toml "$local_url")
public_url = $(quote_toml "$public_url_value")
EOF
}

persist_current_operator_config() {
  ensure_operator_local_config || true
  write_operator_config \
    "$startup_backend_selected" \
    "$watchdog_enabled" \
    "$watchdog_interval_minutes" \
    "$(operator_config_value "incidents" "dir" "../incidents")" \
    "$incident_summary_cap_mb" \
    "$configured_local_health_url" \
    "$configured_public_url"
}

set_operator_keepalive_mode() {
  local backend="$1"
  local watchdog="$2"
  load_operator_settings
  ensure_operator_local_config || true
  write_operator_config \
    "$backend" \
    "$watchdog" \
    "$watchdog_interval_minutes" \
    "$(operator_config_value "incidents" "dir" "../incidents")" \
    "$incident_summary_cap_mb" \
    "$configured_local_health_url" \
    "$configured_public_url"
  load_operator_settings
}

ensure_super_admin_credentials() {
  ensure_deployment_local_config || true

  local config_path username password
  config_path="$(active_deployment_config)"
  username="$(toml_section_value "$config_path" "admin" "username")"
  password="$(toml_section_value "$config_path" "admin" "password")"

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
  ./deploy.sh $cmd

Helpful commands:
  ./deploy.sh config:migrate
  ./deploy.sh config:edit

The password must be at least 8 characters. The repository does not ship default
super-admin credentials for safety.
EOF
  exit 1
}

prepare_git_update_config() {
  local created_local=1
  ensure_deployment_local_config && created_local=0

  if git diff --quiet -- "$tracked_deployment_config"; then
    return
  fi

  if [[ "$created_local" -eq 0 ]]; then
    echo "Preserved local deployment values in $local_deployment_config."
    echo "Restoring tracked $tracked_deployment_config so git pull can proceed."
    git checkout -- "$tracked_deployment_config"
    return
  fi

  echo "$tracked_deployment_config has local changes, and $local_deployment_config already exists." >&2
  echo "Review both files, move the intended live values into $local_deployment_config, then restore $tracked_deployment_config before updating." >&2
  exit 1
}

effective_local_health_url() {
  if [[ -n "${LOCAL_HEALTH_URL:-}" ]]; then
    echo "$LOCAL_HEALTH_URL"
    return
  fi
  if [[ -n "$configured_local_health_url" ]]; then
    echo "$configured_local_health_url"
    return
  fi
  echo "$default_local_health_url"
}

local_web_url() {
  local local_url
  local_url="$(effective_local_health_url)"
  if [[ "$local_url" == */health ]]; then
    echo "${local_url%/health}/"
    return
  fi
  echo "$local_url"
}

public_url() {
  if [[ -n "${APP_URL:-}" ]]; then
    echo "${APP_URL%/}"
    return
  fi

  if [[ -n "$configured_public_url" ]]; then
    echo "${configured_public_url%/}"
    return
  fi

  local config_path
  config_path="$(active_deployment_config)"
  if [[ -f "$config_path" ]]; then
    local configured_url
    configured_url="$(
      awk -F '=' '
        $1 ~ /^[[:space:]]*base_url[[:space:]]*$/ {
          value=$2
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
          gsub(/^"|"$/, "", value)
          print value
          exit
        }
      ' "$config_path"
    )"
    if [[ -n "$configured_url" ]]; then
      echo "${configured_url%/}"
      return
    fi
  fi

  return 1
}

effective_public_health_url() {
  local base_url
  base_url="$(public_url)" || return 1
  echo "${base_url%/}/health"
}

run_podman_compose() {
  export APP_CONFIG_DIR="${APP_CONFIG_DIR:-$repo_root/config}"

  if command -v podman >/dev/null 2>&1; then
    podman compose -f "$compose_file" "$@"
    return
  fi

  if command -v podman-compose >/dev/null 2>&1; then
    podman-compose -f "$compose_file" "$@"
    return
  fi

  echo "Podman is required. Install podman or podman-compose, then retry." >&2
  exit 1
}

service_container_id() {
  local container_id
  container_id="$(
    podman ps -a \
      --filter "label=io.podman.compose.service=$service_name" \
      --format "{{.ID}}" 2>/dev/null |
      sed -n '1p' || true
  )"
  if [[ -n "$container_id" ]]; then
    echo "$container_id"
    return
  fi

  podman ps -a --format "{{.ID}} {{.Names}}" 2>/dev/null |
    awk -v service="$service_name" '$2 ~ service { print $1; exit }' || true
}

container_state_summary() {
  local container_id
  container_id="$(service_container_id)"
  if [[ -z "$container_id" ]]; then
    echo "missing|||"
    return
  fi

  local summary
  summary="$(podman inspect --format '{{.State.Status}}|{{.State.ExitCode}}|{{.State.Error}}|{{.Name}}' "$container_id" 2>/dev/null || true)"
  if [[ -z "$summary" ]]; then
    echo "unknown|||$container_id"
    return
  fi
  echo "$summary"
}

probe_url() {
  local url="$1"
  local timeout="${2:-10}"
  local body_file error_file
  body_file="$(mktemp)"
  error_file="$(mktemp)"
  PROBE_HTTP_CODE="000"
  PROBE_CURL_EXIT=0
  PROBE_BODY=""
  PROBE_ERROR=""
  PROBE_HTTP_CODE="$(curl --silent --show-error --max-time "$timeout" -o "$body_file" -w "%{http_code}" "$url" 2>"$error_file")" || PROBE_CURL_EXIT=$?
  if [[ "$PROBE_CURL_EXIT" -ne 0 ]]; then
    PROBE_HTTP_CODE="000"
  fi
  PROBE_BODY="$(cat "$body_file" 2>/dev/null || true)"
  PROBE_ERROR="$(cat "$error_file" 2>/dev/null || true)"
  rm -f "$body_file" "$error_file"
}

extract_json_string_field() {
  local body="$1"
  local field="$2"
  printf '%s' "$body" | sed -n "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | sed -n '1p'
}

extract_json_ok_flag() {
  local body="$1"
  if printf '%s' "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
    echo "true"
    return
  fi
  echo "false"
}

probe_local_api_health() {
  local url
  url="$(effective_local_health_url)"
  probe_url "$url" 10
  LOCAL_API_HTTP_CODE="$PROBE_HTTP_CODE"
  LOCAL_API_CURL_EXIT="$PROBE_CURL_EXIT"
  LOCAL_API_BODY="$PROBE_BODY"
  LOCAL_API_ERROR="$PROBE_ERROR"
  LOCAL_API_ERROR_CODE="$(extract_json_string_field "$LOCAL_API_BODY" "errorCode")"
  LOCAL_API_OK="false"
  if [[ "$LOCAL_API_CURL_EXIT" -eq 0 && "$LOCAL_API_HTTP_CODE" == "200" && "$(extract_json_ok_flag "$LOCAL_API_BODY")" == "true" ]]; then
    LOCAL_API_OK="true"
  fi
}

probe_local_web_health() {
  probe_url "$(local_web_url)" 10
  LOCAL_WEB_HTTP_CODE="$PROBE_HTTP_CODE"
  LOCAL_WEB_CURL_EXIT="$PROBE_CURL_EXIT"
  LOCAL_WEB_BODY="$PROBE_BODY"
  LOCAL_WEB_ERROR="$PROBE_ERROR"
  LOCAL_WEB_OK="false"
  if [[ "$LOCAL_WEB_CURL_EXIT" -eq 0 && "$LOCAL_WEB_HTTP_CODE" =~ ^2 ]]; then
    LOCAL_WEB_OK="true"
  fi
}

probe_public_health() {
  local public_health_url
  if ! public_health_url="$(effective_public_health_url)"; then
    PUBLIC_HTTP_CODE="skipped"
    PUBLIC_CURL_EXIT=0
    PUBLIC_BODY=""
    PUBLIC_ERROR=""
    PUBLIC_OK="skipped"
    return
  fi
  probe_url "$public_health_url" 15
  PUBLIC_HTTP_CODE="$PROBE_HTTP_CODE"
  PUBLIC_CURL_EXIT="$PROBE_CURL_EXIT"
  PUBLIC_BODY="$PROBE_BODY"
  PUBLIC_ERROR="$PROBE_ERROR"
  PUBLIC_OK="false"
  if [[ "$PUBLIC_CURL_EXIT" -eq 0 && "$PUBLIC_HTTP_CODE" == "200" && "$(extract_json_ok_flag "$PUBLIC_BODY")" == "true" ]]; then
    PUBLIC_OK="true"
  fi
}

wait_for_local_health() {
  for _ in $(seq 1 "$health_wait_retries"); do
    probe_local_api_health
    if [[ "$LOCAL_API_OK" == "true" ]]; then
      echo "Local health OK: $(effective_local_health_url)"
      return 0
    fi
    sleep "$health_wait_sleep_seconds"
  done

  echo "Timed out waiting for local health: $(effective_local_health_url)" >&2
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

systemd_user_available() {
  command -v systemctl >/dev/null 2>&1 && systemctl --user --version >/dev/null 2>&1
}

cron_available() {
  command -v crontab >/dev/null 2>&1
}

determine_effective_startup_backend() {
  local selected="$1"
  case "$selected" in
    disabled)
      echo "disabled"
      ;;
    auto)
      if systemd_user_available; then
        echo "systemd"
      elif cron_available; then
        echo "cron"
      else
        echo "unavailable"
      fi
      ;;
    systemd)
      if systemd_user_available; then
        echo "systemd"
      else
        echo "unavailable"
      fi
      ;;
    cron)
      if cron_available; then
        echo "cron"
      else
        echo "unavailable"
      fi
      ;;
    *)
      echo "unavailable"
      ;;
  esac
}

systemd_user_dir() {
  echo "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
}

systemd_stack_unit_path() {
  echo "$(systemd_user_dir)/$stack_unit_name"
}

systemd_watchdog_service_path() {
  echo "$(systemd_user_dir)/$watchdog_service_name"
}

systemd_watchdog_timer_path() {
  echo "$(systemd_user_dir)/$watchdog_timer_name"
}

enable_linger_if_possible() {
  if ! command -v loginctl >/dev/null 2>&1; then
    return 0
  fi
  loginctl enable-linger "$USER" >/dev/null 2>&1 && return 0
  sudo -n loginctl enable-linger "$USER" >/dev/null 2>&1 && return 0
  return 1
}

linger_status() {
  if ! command -v loginctl >/dev/null 2>&1; then
    echo "unknown"
    return
  fi
  local value
  value="$(loginctl show-user "$USER" -p Linger --value 2>/dev/null || true)"
  if [[ "$value" == "yes" || "$value" == "no" ]]; then
    echo "$value"
    return
  fi
  echo "unknown"
}

install_systemd_keepalive() {
  local unit_dir
  unit_dir="$(systemd_user_dir)"
  mkdir -p "$unit_dir"

  cat >"$(systemd_stack_unit_path)" <<EOF
[Unit]
Description=OpaVoting deployed stack
After=default.target

[Service]
Type=oneshot
WorkingDirectory=$repo_root
Environment=OPAVOTING_SKIP_KEEPALIVE_AUTO_SETUP=1
ExecStart=/bin/bash $repo_root/deploy.sh up
ExecStop=/bin/bash $repo_root/deploy.sh down
RemainAfterExit=yes
TimeoutStartSec=0

[Install]
WantedBy=default.target
EOF

  cat >"$(systemd_watchdog_service_path)" <<EOF
[Unit]
Description=OpaVoting watchdog

[Service]
Type=oneshot
WorkingDirectory=$repo_root
Environment=OPAVOTING_SKIP_KEEPALIVE_AUTO_SETUP=1
ExecStart=/bin/bash $repo_root/deploy.sh watchdog:run
EOF

  cat >"$(systemd_watchdog_timer_path)" <<EOF
[Unit]
Description=OpaVoting watchdog timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=${watchdog_interval_minutes}min
Unit=$watchdog_service_name

[Install]
WantedBy=timers.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now "$stack_unit_name" >/dev/null
  if [[ "$watchdog_enabled" == "true" ]]; then
    systemctl --user enable --now "$watchdog_timer_name" >/dev/null
  else
    systemctl --user disable --now "$watchdog_timer_name" >/dev/null 2>&1 || true
  fi
  enable_linger_if_possible || true
}

remove_systemd_keepalive() {
  if systemd_user_available; then
    systemctl --user disable --now "$watchdog_timer_name" >/dev/null 2>&1 || true
    systemctl --user disable --now "$stack_unit_name" >/dev/null 2>&1 || true
    systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
  rm -f "$(systemd_stack_unit_path)" "$(systemd_watchdog_service_path)" "$(systemd_watchdog_timer_path)"
}

cron_block_marker_begin() {
  echo "# BEGIN OPAVOTING KEEPALIVE"
}

cron_block_marker_end() {
  echo "# END OPAVOTING KEEPALIVE"
}

cron_schedule_expression() {
  if [[ "$watchdog_interval_minutes" -ge 60 ]]; then
    echo "0 * * * *"
    return
  fi
  echo "*/$watchdog_interval_minutes * * * *"
}

install_cron_keepalive() {
  local current_crontab temp_file
  current_crontab="$(mktemp)"
  temp_file="$(mktemp)"
  if ! crontab -l >"$current_crontab" 2>/dev/null; then
    : >"$current_crontab"
  fi

  awk '
    BEGIN { skip=0 }
    $0 == "'"$(cron_block_marker_begin)"'" { skip=1; next }
    $0 == "'"$(cron_block_marker_end)"'" { skip=0; next }
    !skip { print }
  ' "$current_crontab" >"$temp_file"

  {
    cat "$temp_file"
    echo "$(cron_block_marker_begin)"
    echo "@reboot cd $repo_root && OPAVOTING_SKIP_KEEPALIVE_AUTO_SETUP=1 ./deploy.sh up >/dev/null 2>&1"
    if [[ "$watchdog_enabled" == "true" ]]; then
      echo "$(cron_schedule_expression) cd $repo_root && OPAVOTING_SKIP_KEEPALIVE_AUTO_SETUP=1 ./deploy.sh watchdog:run >/dev/null 2>&1"
    fi
    echo "$(cron_block_marker_end)"
  } >"$current_crontab"

  crontab "$current_crontab"
  rm -f "$current_crontab" "$temp_file"
}

remove_cron_keepalive() {
  if ! cron_available; then
    return 0
  fi
  local current_crontab temp_file
  current_crontab="$(mktemp)"
  temp_file="$(mktemp)"
  if ! crontab -l >"$current_crontab" 2>/dev/null; then
    rm -f "$current_crontab" "$temp_file"
    return 0
  fi
  awk '
    BEGIN { skip=0 }
    $0 == "'"$(cron_block_marker_begin)"'" { skip=1; next }
    $0 == "'"$(cron_block_marker_end)"'" { skip=0; next }
    !skip { print }
  ' "$current_crontab" >"$temp_file"
  crontab "$temp_file"
  rm -f "$current_crontab" "$temp_file"
}

cron_keepalive_installed() {
  if ! cron_available; then
    echo "no"
    return
  fi
  if crontab -l 2>/dev/null | grep -F "$(cron_block_marker_begin)" >/dev/null; then
    echo "yes"
    return
  fi
  echo "no"
}

systemd_keepalive_installed() {
  if [[ -f "$(systemd_stack_unit_path)" ]]; then
    echo "yes"
    return
  fi
  echo "no"
}

startup_enabled_state() {
  if [[ "$startup_backend_selected" == "disabled" ]]; then
    echo "disabled"
    return
  fi
  case "$effective_startup_backend" in
    systemd)
      echo "$(systemd_keepalive_installed)"
      ;;
    cron)
      echo "$(cron_keepalive_installed)"
      ;;
    *)
      echo "no"
      ;;
  esac
}

ensure_incident_structure() {
  mkdir -p "$incident_dir/runtime" "$incident_dir/incidents" "$incident_dir/counter-state"
}

incident_runtime_current_log() {
  echo "$incident_dir/runtime/current.log"
}

incident_runtime_previous_log() {
  echo "$incident_dir/runtime/previous.log"
}

planned_action_file() {
  echo "$incident_dir/planned-action.state"
}

watchdog_status_file() {
  echo "$incident_dir/watchdog-status.state"
}

restart_throttle_file() {
  echo "$incident_dir/restart-throttle.state"
}

counter_state_dir() {
  echo "$incident_dir/counter-state"
}

latest_incident_json() {
  echo "$incident_dir/latest.json"
}

latest_incident_text() {
  echo "$incident_dir/latest.txt"
}

unacknowledged_incident_marker() {
  echo "$incident_dir/unacknowledged"
}

clear_unacknowledged_incident_marker() {
  load_operator_settings
  ensure_incident_structure
  rm -f "$(unacknowledged_incident_marker)"
}

json_escape() {
  printf '%s' "$1" | sed ':a;N;$!ba;s/\\/\\\\/g;s/"/\\"/g;s/\r/\\r/g;s/\n/\\n/g'
}

write_key_value_state() {
  local target="$1"
  shift
  : >"$target"
  while [[ "$#" -gt 0 ]]; do
    printf '%s\n' "$1" >>"$target"
    shift
  done
}

state_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  awk -F '=' -v key="$key" '$1 == key { sub(/^[^=]+=/, "", $0); print $0; exit }' "$file"
}

mark_planned_action() {
  load_operator_settings
  ensure_incident_structure
  local action="$1"
  local expires_at
  expires_at="$(( $(date +%s) + planned_action_ttl_seconds ))"
  write_key_value_state "$(planned_action_file)" "action=$action" "expires_at=$expires_at"
}

clear_planned_action() {
  load_operator_settings
  ensure_incident_structure
  rm -f "$(planned_action_file)"
}

planned_action_active() {
  load_operator_settings
  ensure_incident_structure
  local file expires_at
  file="$(planned_action_file)"
  [[ -f "$file" ]] || return 1
  expires_at="$(state_value "$file" "expires_at" || true)"
  if [[ ! "$expires_at" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  [[ "$(date +%s)" -le "$expires_at" ]]
}

planned_action_label() {
  state_value "$(planned_action_file)" "action" || true
}

capture_service_logs_to() {
  local destination="$1"
  local container_id
  container_id="$(service_container_id)"
  if [[ -z "$container_id" ]]; then
    printf 'No app container found at %s.\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >"$destination"
    return
  fi
  podman logs --tail "$tail_lines" "$container_id" >"$destination" 2>&1 || {
    printf 'Unable to read container logs at %s.\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >"$destination"
  }
}

rotate_runtime_logs_for_attempt() {
  load_operator_settings
  ensure_incident_structure
  local current_log previous_log
  current_log="$(incident_runtime_current_log)"
  previous_log="$(incident_runtime_previous_log)"
  if [[ -f "$current_log" ]]; then
    mv "$current_log" "$previous_log"
  else
    rm -f "$previous_log"
  fi
  capture_service_logs_to "$current_log"
}

render_counters_json() {
  load_operator_settings
  ensure_incident_structure
  local output first=1
  output="{"
  local file
  for file in "$(counter_state_dir)"/*.count; do
    if [[ ! -f "$file" ]]; then
      continue
    fi
    local type count
    type="$(basename "$file" .count)"
    count="$(cat "$file" 2>/dev/null || echo 0)"
    if [[ "$first" -eq 0 ]]; then
      output+=","
    fi
    output+="\"$(json_escape "$type")\":$count"
    first=0
  done
  output+="}"
  printf '%s\n' "$output" >"$incident_dir/counters.json"
}

increment_failure_counter() {
  local failure_type="$1"
  local file count
  load_operator_settings
  ensure_incident_structure
  file="$(counter_state_dir)/$failure_type.count"
  count=0
  if [[ -f "$file" ]]; then
    count="$(cat "$file" 2>/dev/null || echo 0)"
  fi
  count="$((count + 1))"
  printf '%s\n' "$count" >"$file"
  render_counters_json
}

prune_incident_summaries() {
  load_operator_settings
  ensure_incident_structure
  local cap_bytes total_bytes
  cap_bytes="$((incident_summary_cap_mb * 1024 * 1024))"
  while true; do
    total_bytes="$(
      find "$incident_dir" -maxdepth 2 -type f \
        ! -path "$(latest_incident_json)" \
        ! -path "$(latest_incident_text)" \
        ! -path "$incident_dir/counters.json" \
        ! -path "$(incident_runtime_current_log)" \
        ! -path "$(incident_runtime_previous_log)" \
        ! -path "$(unacknowledged_incident_marker)" \
        -printf '%s\n' 2>/dev/null | awk '{ sum += $1 } END { print sum + 0 }'
    )"
    if [[ "$total_bytes" -le "$cap_bytes" ]]; then
      break
    fi
    local oldest
    oldest="$(find "$incident_dir/incidents" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | sed -n '1p' | cut -d' ' -f2-)"
    if [[ -z "$oldest" ]]; then
      break
    fi
    rm -f -- "$oldest"
  done
}

record_incident() {
  local failure_type="$1"
  local summary="$2"
  local restart_attempted="$3"
  local restart_succeeded="$4"
  local classification="$5"
  load_operator_settings
  ensure_incident_structure
  rotate_runtime_logs_for_attempt
  increment_failure_counter "$failure_type"

  local timestamp incident_id json_file text_file
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  incident_id="${timestamp//:/-}_${failure_type}"
  json_file="$incident_dir/incidents/$incident_id.json"
  text_file="$incident_dir/incidents/$incident_id.txt"

  local current_log previous_log log_excerpt container_summary
  current_log="$(incident_runtime_current_log)"
  previous_log="$(incident_runtime_previous_log)"
  log_excerpt="$(tail -n 40 "$current_log" 2>/dev/null || true)"
  container_summary="$(container_state_summary)"

  cat >"$json_file" <<EOF
{
  "timestamp": "$(json_escape "$timestamp")",
  "failureType": "$(json_escape "$failure_type")",
  "classification": "$(json_escape "$classification")",
  "summary": "$(json_escape "$summary")",
  "projectVersion": "$(json_escape "$(project_version)")",
  "gitCommit": "$(json_escape "$(git_commit)")",
  "selectedBackend": "$(json_escape "$startup_backend_selected")",
  "effectiveBackend": "$(json_escape "$effective_startup_backend")",
  "restartAttempted": $restart_attempted,
  "restartSucceeded": $restart_succeeded,
  "containerState": "$(json_escape "$container_summary")",
  "currentLogPath": "$(json_escape "$current_log")",
  "previousLogPath": "$(json_escape "$previous_log")",
  "logExcerpt": "$(json_escape "$log_excerpt")"
}
EOF

  cat >"$text_file" <<EOF
[$timestamp] $failure_type ($classification)
$summary
Restart attempted: $restart_attempted
Restart succeeded: $restart_succeeded
Project version: $(project_version)
Git commit: $(git_commit)
Selected backend: $startup_backend_selected
Effective backend: $effective_startup_backend
Current log: $current_log
Previous log: $previous_log
EOF

  cp "$json_file" "$(latest_incident_json)"
  cp "$text_file" "$(latest_incident_text)"
  if [[ "$restart_succeeded" == "true" ]]; then
    clear_unacknowledged_incident_marker
  else
    printf '%s\n' "$timestamp $failure_type $summary" >"$(unacknowledged_incident_marker)"
  fi
  prune_incident_summaries
}

acknowledge_incident() {
  clear_unacknowledged_incident_marker
  echo "Acknowledged current incident."
}

write_watchdog_status() {
  local result="$1"
  local message="$2"
  local failure_type="${3:-}"
  load_operator_settings
  ensure_incident_structure
  write_key_value_state "$(watchdog_status_file)" \
    "timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    "result=$result" \
    "message=$(printf '%s' "$message" | tr '\n' ' ')" \
    "failure_type=$failure_type" \
    "backend=$effective_startup_backend"
}

restart_throttled_for() {
  local failure_type="$1"
  load_operator_settings
  ensure_incident_structure
  local file timestamp type
  file="$(restart_throttle_file)"
  [[ -f "$file" ]] || return 1
  type="$(state_value "$file" "failure_type" || true)"
  timestamp="$(state_value "$file" "timestamp" || true)"
  [[ "$type" == "$failure_type" ]] || return 1
  [[ "$timestamp" =~ ^[0-9]+$ ]] || return 1
  [[ $(( $(date +%s) - timestamp )) -lt 300 ]]
}

note_restart_attempt() {
  local failure_type="$1"
  load_operator_settings
  ensure_incident_structure
  write_key_value_state "$(restart_throttle_file)" "failure_type=$failure_type" "timestamp=$(date +%s)"
}

restart_stack_for_watchdog() {
  mark_planned_action "watchdog-recovery"
  local container_id status=0
  container_id="$(service_container_id)"
  if [[ -n "$container_id" ]]; then
    run_podman_compose restart "$service_name" || status=$?
  else
    run_podman_compose up -d || status=$?
  fi
  clear_planned_action
  return "$status"
}

can_manage_caddy_without_prompt() {
  command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1
}

attempt_proxy_recovery() {
  if ! can_manage_caddy_without_prompt; then
    return 1
  fi
  sudo -n systemctl reload "$caddy_service_name" >/dev/null 2>&1 && return 0
  sudo -n systemctl restart "$caddy_service_name" >/dev/null 2>&1
}

classify_local_failure() {
  if [[ -n "$LOCAL_API_ERROR_CODE" ]]; then
    echo "$LOCAL_API_ERROR_CODE"
    return
  fi

  local container_status
  container_status="$(container_state_summary)"
  case "${container_status%%|*}" in
    missing)
      if [[ "$effective_startup_backend" == "systemd" && "$(linger_status)" != "yes" ]]; then
        echo "session_runtime_shutdown"
      else
        echo "boot_autostart_missing"
      fi
      ;;
    exited | stopping)
      echo "container_exited_unexpectedly"
      ;;
    running)
      echo "api_unhealthy"
      ;;
    *)
      echo "local_health_failed"
      ;;
  esac
}

summarize_incident_status() {
  load_operator_settings
  ensure_incident_structure
  if [[ -f "$(unacknowledged_incident_marker)" ]]; then
    echo "unacknowledged unexpected failure"
    return
  fi
  if [[ -f "$(latest_incident_text)" ]]; then
    echo "acknowledged retained incident"
    return
  fi
  echo "clean"
}

latest_incident_summary() {
  load_operator_settings
  ensure_incident_structure
  if [[ -f "$(latest_incident_text)" ]]; then
    sed -n '1,2p' "$(latest_incident_text)" | tr '\n' ' ' | sed 's/[[:space:]]\+$//'
    return
  fi
  echo "No retained incidents."
}

print_health_summary() {
  local scope="$1"
  load_operator_settings
  probe_local_api_health
  probe_local_web_health
  probe_public_health

  local startup_state
  startup_state="$(startup_enabled_state)"

  echo "Scope: $scope"
  echo "Selected backend: $startup_backend_selected"
  echo "Effective backend: $effective_startup_backend"
  echo "Autostart installed: $startup_state"
  echo "Watchdog enabled: $watchdog_enabled"
  echo "Watchdog cadence: every $watchdog_interval_minutes minute(s)"
  echo "Incident status: $(summarize_incident_status)"
  echo "Latest incident: $(latest_incident_summary)"
  echo "Local API health URL: $(effective_local_health_url)"
  echo "Local API: $LOCAL_API_OK (http=$LOCAL_API_HTTP_CODE)"
  if [[ -n "$LOCAL_API_ERROR_CODE" ]]; then
    echo "Local API failure type: $LOCAL_API_ERROR_CODE"
  fi
  echo "Local web: $LOCAL_WEB_OK (http=$LOCAL_WEB_HTTP_CODE)"
  if [[ "$PUBLIC_OK" == "skipped" ]]; then
    echo "Public health: skipped (no public URL configured)"
  else
    echo "Public health: $PUBLIC_OK (http=$PUBLIC_HTTP_CODE)"
  fi
}

print_startup_status() {
  load_operator_settings
  local startup_state
  startup_state="$(startup_enabled_state)"
  echo "Selected backend: $startup_backend_selected"
  echo "Effective backend: $effective_startup_backend"
  echo "Autostart installed: $startup_state"
  if [[ "$effective_startup_backend" == "systemd" ]]; then
    echo "Systemd unit dir: $(systemd_user_dir)"
    echo "Linger: $(linger_status)"
  elif [[ "$effective_startup_backend" == "cron" ]]; then
    echo "Cron keep-alive installed: $(cron_keepalive_installed)"
  fi
  echo "Watchdog enabled: $watchdog_enabled"
}

print_watchdog_status() {
  load_operator_settings
  echo "Selected backend: $startup_backend_selected"
  echo "Effective backend: $effective_startup_backend"
  echo "Watchdog enabled: $watchdog_enabled"
  echo "Watchdog cadence: every $watchdog_interval_minutes minute(s)"
  if [[ -f "$(watchdog_status_file)" ]]; then
    echo "Last watchdog run: $(state_value "$(watchdog_status_file)" "timestamp" || true)"
    echo "Last watchdog result: $(state_value "$(watchdog_status_file)" "result" || true)"
    echo "Last watchdog message: $(state_value "$(watchdog_status_file)" "message" || true)"
  else
    echo "Last watchdog run: never"
  fi
}

print_incident_report() {
  load_operator_settings
  ensure_incident_structure
  echo "Incident status: $(summarize_incident_status)"
  echo "Incident dir: $incident_dir"
  echo "Current log: $(incident_runtime_current_log)"
  echo "Previous log: $(incident_runtime_previous_log)"
  echo "Counters: $incident_dir/counters.json"
  if [[ -f "$incident_dir/counters.json" ]]; then
    echo "Failure counters:"
    cat "$incident_dir/counters.json"
  fi
  echo "Latest summary: $(latest_incident_summary)"
  if [[ -d "$incident_dir/incidents" ]]; then
    echo "Recent incidents:"
    find "$incident_dir/incidents" -maxdepth 1 -type f -name '*.txt' -printf '%TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort -r | head -10
  fi
}

install_keepalive_backend() {
  load_operator_settings
  case "$effective_startup_backend" in
    systemd)
      install_systemd_keepalive
      remove_cron_keepalive
      ;;
    cron)
      install_cron_keepalive
      remove_systemd_keepalive
      ;;
    disabled)
      remove_systemd_keepalive
      remove_cron_keepalive
      ;;
    *)
      echo "No supported startup backend is available for selected mode '$startup_backend_selected'." >&2
      return 1
      ;;
  esac
}

enable_keepalive() {
  load_operator_settings
  if [[ "$startup_backend_selected" == "disabled" ]]; then
    set_operator_keepalive_mode "auto" "true"
  fi
  load_operator_settings
  if [[ "$effective_startup_backend" == "unavailable" ]]; then
    echo "Could not enable keep-alive automatically: no supported backend is available." >&2
    return 1
  fi
  install_keepalive_backend
  echo "Keep-alive enabled with backend: $effective_startup_backend"
}

disable_keepalive() {
  set_operator_keepalive_mode "disabled" "false"
  remove_systemd_keepalive
  remove_cron_keepalive
  echo "Keep-alive disabled."
}

maybe_auto_enable_keepalive() {
  load_operator_settings
  if [[ "${OPAVOTING_SKIP_KEEPALIVE_AUTO_SETUP:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "$auto_enable_keepalive" != "1" ]]; then
    return 0
  fi
  if [[ "$startup_backend_selected" == "disabled" || "$watchdog_enabled" != "true" && "$effective_startup_backend" == "disabled" ]]; then
    echo "Keep-alive remains disabled by config."
    return 0
  fi
  if enable_keepalive; then
    echo "Startup enabled automatically: yes"
    echo "Startup backend selected: $startup_backend_selected"
    echo "Startup backend effective: $effective_startup_backend"
    echo "Watchdog enabled automatically: $watchdog_enabled"
    echo "Inspect later with: ./deploy.sh startup:status && ./deploy.sh watchdog:status"
    return 0
  fi
  echo "Startup/watchdog could not be enabled automatically." >&2
  echo "Run ./deploy.sh startup:enable after resolving the backend availability on this host." >&2
}

run_watchdog() {
  load_operator_settings
  ensure_incident_structure
  if [[ "$watchdog_enabled" != "true" || "$startup_backend_selected" == "disabled" ]]; then
    write_watchdog_status "disabled" "Watchdog disabled by config."
    echo "Watchdog disabled by config."
    return 0
  fi

  probe_local_api_health
  probe_local_web_health
  probe_public_health

  if [[ "$LOCAL_API_OK" == "true" && "$LOCAL_WEB_OK" == "true" && ( "$PUBLIC_OK" == "true" || "$PUBLIC_OK" == "skipped" ) ]]; then
    clear_unacknowledged_incident_marker
    write_watchdog_status "success" "Local and public health are OK."
    echo "Watchdog: healthy."
    return 0
  fi

  if planned_action_active; then
    local planned_label
    planned_label="$(planned_action_label)"
    write_watchdog_status "planned" "Suppressed during planned action: ${planned_label:-unknown}."
    echo "Watchdog suppressed during planned action: ${planned_label:-unknown}."
    return 0
  fi

  local failure_type summary restart_attempted=false restart_succeeded=false classification="unexpected"
  if [[ "$LOCAL_API_OK" != "true" ]]; then
    failure_type="$(classify_local_failure)"
    summary="Local API health failed (http=$LOCAL_API_HTTP_CODE)."

    if ! restart_throttled_for "$failure_type"; then
      case "$failure_type" in
        db_migration_failed | db_missing_or_corrupt)
          restart_attempted=false
          ;;
        *)
          restart_attempted=true
          note_restart_attempt "$failure_type"
          if restart_stack_for_watchdog; then
            if wait_for_local_health >/dev/null 2>&1; then
              restart_succeeded=true
              summary="Recovered from $failure_type after stack restart."
            else
              summary="Restart attempted for $failure_type but local health did not recover."
            fi
          else
            summary="Restart attempt failed for $failure_type."
          fi
          ;;
      esac
    else
      summary="Restart throttled for recurring $failure_type."
    fi
  elif [[ "$LOCAL_WEB_OK" != "true" ]]; then
    failure_type="frontend_unhealthy"
    summary="Local web delivery failed while API health still responded."
    if ! restart_throttled_for "$failure_type"; then
      restart_attempted=true
      note_restart_attempt "$failure_type"
      if restart_stack_for_watchdog && wait_for_local_health >/dev/null 2>&1; then
        restart_succeeded=true
        summary="Recovered from local web delivery failure after restart."
      fi
    fi
  else
    failure_type="proxy_unhealthy"
    summary="Public health failed while local stack remained healthy."
    if attempt_proxy_recovery; then
      restart_attempted=true
      probe_public_health
      if [[ "$PUBLIC_OK" == "true" ]]; then
        restart_succeeded=true
        summary="Recovered public proxy health after Caddy reload/restart."
      fi
    fi
  fi

  record_incident "$failure_type" "$summary" "$restart_attempted" "$restart_succeeded" "$classification"
  write_watchdog_status "incident" "$summary" "$failure_type"
  echo "Watchdog incident recorded: $failure_type"
  [[ "$restart_succeeded" == "true" ]]
}

show_help() {
  cat <<EOF
Usage: ./deploy.sh <command>

Purpose:
  VPS/operator helper for the deployed app. Run it from the repo checkout on the server,
  for example /opt/opa-voting-tool/app.

Environment overrides:
  APP_URL=http(s)://host      Public URL for public health checks. Defaults to config/deploy.local.toml,
                              then config/deployment.local.toml base_url, then config/deployment.toml.
  APP_CONFIG_DIR=path         Host config directory mounted into the app container. Default: $repo_root/config
  LOCAL_HEALTH_URL=url        Local app health URL. Default: $default_local_health_url
  HEALTH_WAIT_RETRIES=count   Poll iterations while waiting for local health. Default: $health_wait_retries
  HEALTH_WAIT_SLEEP_SECONDS=n Seconds between local health polls. Default: $health_wait_sleep_seconds
  BACKUP_DIR=path             Backup output directory. Default: $backup_dir
  DATA_VOLUME_NAME=name       Podman volume restored by restore. Default: $data_volume_name
  BACKUP_PRUNE_KEEP=count     Backups kept by backup:prune. Default: $backup_prune_keep
  BACKUP_PRUNE_DRY_RUN=1      Preview backup:prune without deleting files.
  DEPLOY_AUTO_ENABLE_KEEPALIVE=0
                              Skip automatic keep-alive setup after deploy/update/rebuild.
  TAIL=lines                  Log tail line count. Default: $tail_lines

Stack:
  ./deploy.sh version         Show project version and current git commit
  ./deploy.sh up              Start the compose service in the background
  ./deploy.sh down            Stop and remove the compose service
  ./deploy.sh restart         Restart the app service and wait for local health
  ./deploy.sh rebuild         Build with --no-cache and recreate the service
  ./deploy.sh update          Backup, git pull --ff-only, rebuild, and health-check
  ./deploy.sh ps              Show compose/container status

Health and diagnostics:
  ./deploy.sh health          Check local app health and keep-alive status
  ./deploy.sh public-health   Check public HTTPS health and keep-alive status
  ./deploy.sh diagnose        Print health, keep-alive, incident, Caddy, disk, firewall, and recent log diagnostics
  ./deploy.sh logs            Show recent app logs
  ./deploy.sh logs:follow     Follow app logs
  ./deploy.sh startup:status  Show autostart backend and installation state
  ./deploy.sh startup:enable  Enable default keep-alive with systemd or cron backend
  ./deploy.sh startup:disable Disable autostart plus scheduled watchdog
  ./deploy.sh watchdog:status Show watchdog cadence and last run summary
  ./deploy.sh watchdog:run    Run one watchdog cycle immediately
  ./deploy.sh incidents       Show the retained incident summary and counters
  ./deploy.sh incidents:ack   Optionally clear the current unacknowledged incident marker
  ./deploy.sh usage           Show public-trial/operator usage summary
  ./deploy.sh usage:json      Show usage summary as JSON
  ./deploy.sh users:export    Export registered-user summary JSON
  ./deploy.sh workspaces:export Export workspace summary JSON

Caddy:
  ./deploy.sh caddy:validate  Validate /etc/caddy/Caddyfile
  ./deploy.sh caddy:reload    Validate and reload Caddy
  ./deploy.sh caddy:status    Show Caddy systemd status
  ./deploy.sh caddy:logs      Show recent Caddy logs

Config and backups:
  ./deploy.sh config:migrate  Create ignored config/deployment.local.toml from the tracked config
  ./deploy.sh config:edit     Edit config/deployment.local.toml
  ./deploy.sh domains:edit    Edit config/allowed-domains.txt
  ./deploy.sh backup          Archive app data plus deployment config/branding files
  ./deploy.sh backup:list     List recent backups
  ./deploy.sh backup:prune    Delete older backups beyond BACKUP_PRUNE_KEEP
  ./deploy.sh restore <file>  Stop the app, restore a backup archive, restart, and health-check
EOF
}

run_usage_report() {
  local report_cmd="$1"
  local container_id
  container_id="$(service_container_id)"
  if [[ -z "$container_id" ]]; then
    echo "No app container found. Start the app first with ./deploy.sh up." >&2
    exit 1
  fi

  podman exec "$container_id" pnpm --filter @planning-poker/api exec tsx src/usageReportCli.ts "$report_cmd"
}

make_backup() {
  local timestamp tmp_dir archive container_id
  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  archive="$backup_dir/planning-poker-backup-$timestamp.tar.gz"
  tmp_dir="$(mktemp -d)"

  mkdir -p "$backup_dir"

  mkdir -p "$tmp_dir/config"
  [[ -f "$local_deployment_config" ]] && cp "$local_deployment_config" "$tmp_dir/config/deployment.local.toml"
  [[ -f "$tracked_deployment_config" ]] && cp "$tracked_deployment_config" "$tmp_dir/config/deployment.toml"
  [[ -f "$local_operator_config" ]] && cp "$local_operator_config" "$tmp_dir/config/deploy.local.toml"
  [[ -f "$tracked_operator_config" ]] && cp "$tracked_operator_config" "$tmp_dir/config/deploy.toml"
  [[ -f config/allowed-domains.txt ]] && cp config/allowed-domains.txt "$tmp_dir/config/allowed-domains.txt"
  if [[ -d config/managed-branding ]]; then
    cp -a config/managed-branding "$tmp_dir/config/managed-branding"
  fi

  container_id="$(service_container_id)"
  if [[ -n "$container_id" ]]; then
    mkdir -p "$tmp_dir/api-data"
    podman cp "$container_id:/app/apps/api/data/." "$tmp_dir/api-data"
  else
    echo "Warning: no app container found; backup will include config/branding only." >&2
  fi

  tar -C "$tmp_dir" -czf "$archive" .
  rm -rf "$tmp_dir"
  echo "Backup written: $archive"
}

list_backup_archives() {
  if [[ ! -d "$backup_dir" ]]; then
    return
  fi

  find "$backup_dir" -maxdepth 1 -type f -name 'planning-poker-backup-*.tar.gz' -printf '%T@ %p\n' |
    sort -rn |
    awk '{ $1=""; sub(/^ /, ""); print }'
}

prune_backups() {
  local keep="$backup_prune_keep"
  if [[ ! "$keep" =~ ^[0-9]+$ || "$keep" -lt 1 ]]; then
    echo "BACKUP_PRUNE_KEEP must be a positive integer." >&2
    exit 1
  fi

  if [[ ! -d "$backup_dir" ]]; then
    echo "No backup directory yet: $backup_dir"
    return
  fi

  local index=0
  local pruned=0
  while IFS= read -r archive; do
    index=$((index + 1))
    if [[ "$index" -le "$keep" ]]; then
      continue
    fi

    if [[ "${BACKUP_PRUNE_DRY_RUN:-0}" == "1" ]]; then
      echo "Would delete: $archive"
    else
      rm -f -- "$archive"
      echo "Deleted: $archive"
    fi
    pruned=$((pruned + 1))
  done < <(list_backup_archives)

  if [[ "$pruned" -eq 0 ]]; then
    echo "No backups pruned. Keeping newest $keep backup(s)."
  elif [[ "${BACKUP_PRUNE_DRY_RUN:-0}" == "1" ]]; then
    echo "Dry run complete. $pruned backup(s) would be pruned; keeping newest $keep backup(s)."
  else
    echo "Pruned $pruned backup(s); kept newest $keep backup(s)."
  fi
}

confirm_restore() {
  local archive="$1"

  if [[ "${DEPLOY_RESTORE_CONFIRM:-0}" == "1" ]]; then
    return
  fi

  cat <<EOF
About to restore backup:
  $archive

This will stop the app, overwrite the Podman data volume '$data_volume_name',
restore deployment config/branding files included in the archive, restart the app,
and wait for local health.

Type RESTORE to continue:
EOF
  local answer
  read -r answer
  if [[ "$answer" != "RESTORE" ]]; then
    echo "Restore cancelled."
    exit 1
  fi
}

restore_config_from_backup() {
  local tmp_dir="$1"

  if [[ -f "$tmp_dir/config/deployment.local.toml" ]]; then
    cp "$tmp_dir/config/deployment.local.toml" "$local_deployment_config"
    echo "Restored $local_deployment_config."
  elif [[ -f "$tmp_dir/config/deployment.toml" ]]; then
    cp "$tmp_dir/config/deployment.toml" "$local_deployment_config"
    echo "Restored $local_deployment_config from archived deployment.toml."
  fi

  if [[ -f "$tmp_dir/config/deploy.local.toml" ]]; then
    cp "$tmp_dir/config/deploy.local.toml" "$local_operator_config"
    echo "Restored $local_operator_config."
  fi

  if [[ -f "$tmp_dir/config/allowed-domains.txt" ]]; then
    cp "$tmp_dir/config/allowed-domains.txt" config/allowed-domains.txt
    echo "Restored config/allowed-domains.txt."
  fi

  if [[ -d "$tmp_dir/config/managed-branding" ]]; then
    mkdir -p config
    rm -rf config/managed-branding
    cp -a "$tmp_dir/config/managed-branding" config/managed-branding
    echo "Restored config/managed-branding."
  fi
}

restore_api_data_from_backup() {
  local tmp_dir="$1"
  local api_data_dir="$tmp_dir/api-data"

  if [[ ! -d "$api_data_dir" ]]; then
    echo "No api-data directory found in backup; config/branding restore only."
    return
  fi
  if [[ -d "$api_data_dir/data" && ! -e "$api_data_dir/planning-poker.db" ]]; then
    api_data_dir="$api_data_dir/data"
  fi

  podman volume inspect "$data_volume_name" >/dev/null 2>&1 || podman volume create "$data_volume_name" >/dev/null

  local volume_mount
  volume_mount="$(podman volume inspect "$data_volume_name" --format '{{.Mountpoint}}')"
  if [[ -z "$volume_mount" || ! -d "$volume_mount" ]]; then
    echo "Could not resolve Podman volume mountpoint for $data_volume_name." >&2
    exit 1
  fi

  find "$volume_mount" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  cp -a "$api_data_dir/." "$volume_mount/"
  echo "Restored app data volume $data_volume_name."
}

restore_backup() {
  local archive="${1:-}"

  if [[ -z "$archive" ]]; then
    echo "Usage: ./deploy.sh restore <backup.tar.gz>" >&2
    exit 1
  fi

  if [[ ! -f "$archive" ]]; then
    echo "Backup archive not found: $archive" >&2
    exit 1
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  tar -xzf "$archive" -C "$tmp_dir"
  if [[ ! -d "$tmp_dir/config" && ! -d "$tmp_dir/api-data" ]]; then
    echo "Backup archive does not look like an OpaVoting deploy.sh backup." >&2
    exit 1
  fi

  confirm_restore "$archive"
  mark_planned_action "restore"
  run_podman_compose down --remove-orphans || true
  restore_config_from_backup "$tmp_dir"
  restore_api_data_from_backup "$tmp_dir"
  ensure_super_admin_credentials
  run_podman_compose up -d
  wait_for_local_health
  maybe_auto_enable_keepalive || true
  clear_planned_action
  echo "Restore complete."
}

case "$cmd" in
  help)
    show_help
    ;;
  version)
    print_project_version
    ;;
  up)
    ensure_super_admin_credentials
    mark_planned_action "up"
    run_podman_compose up -d
    wait_for_local_health
    maybe_auto_enable_keepalive || true
    clear_planned_action
    ;;
  down)
    mark_planned_action "down"
    run_podman_compose down
    clear_planned_action
    ;;
  restart)
    ensure_super_admin_credentials
    mark_planned_action "restart"
    run_podman_compose restart "$service_name"
    wait_for_local_health
    maybe_auto_enable_keepalive || true
    clear_planned_action
    ;;
  rebuild)
    ensure_super_admin_credentials
    mark_planned_action "rebuild"
    run_podman_compose build --no-cache
    run_podman_compose up -d --force-recreate
    wait_for_local_health
    maybe_auto_enable_keepalive || true
    clear_planned_action
    ;;
  update)
    prepare_git_update_config
    ensure_super_admin_credentials
    mark_planned_action "update"
    make_backup
    git pull --ff-only
    run_podman_compose build --no-cache
    run_podman_compose up -d --force-recreate
    wait_for_local_health
    maybe_auto_enable_keepalive || true
    clear_planned_action
    ;;
  ps)
    run_podman_compose ps
    ;;
  health)
    print_health_summary "local"
    [[ "$LOCAL_API_OK" == "true" && "$LOCAL_WEB_OK" == "true" ]]
    ;;
  public-health)
    print_health_summary "public"
    [[ "$PUBLIC_OK" == "true" ]]
    ;;
  logs)
    run_podman_compose logs --tail="$tail_lines" "$service_name"
    ;;
  logs:follow)
    run_podman_compose logs --tail="$tail_lines" -f "$service_name"
    ;;
  startup:status)
    print_startup_status
    ;;
  startup:enable)
    enable_keepalive
    print_startup_status
    ;;
  startup:disable)
    disable_keepalive
    print_startup_status
    ;;
  watchdog:status)
    print_watchdog_status
    ;;
  watchdog:run)
    run_watchdog
    ;;
  incidents)
    print_incident_report
    ;;
  incidents:ack)
    acknowledge_incident
    ;;
  usage)
    run_usage_report usage
    ;;
  usage:json)
    run_usage_report usage:json
    ;;
  users:export)
    run_usage_report users:export
    ;;
  workspaces:export)
    run_usage_report workspaces:export
    ;;
  diagnose)
    echo "== Startup status =="
    print_startup_status || true
    echo
    echo "== Watchdog status =="
    print_watchdog_status || true
    echo
    echo "== Incident summary =="
    print_incident_report || true
    echo
    echo "== Local health =="
    print_health_summary "local" || true
    echo
    echo "== Compose status =="
    run_podman_compose ps || true
    echo
    echo "== Published 3001 listener =="
    ss -ltnp | grep ':3001' || true
    echo
    echo "== Recent app logs =="
    run_podman_compose logs --tail="$tail_lines" "$service_name" || true
    echo
    echo "== Current incident log excerpt =="
    tail -n 40 "$(incident_runtime_current_log)" 2>/dev/null || true
    echo
    echo "== Previous incident log excerpt =="
    tail -n 40 "$(incident_runtime_previous_log)" 2>/dev/null || true
    echo
    echo "== Caddy status =="
    sudo systemctl status "$caddy_service_name" --no-pager || true
    echo
    echo "== Recent Caddy logs =="
    sudo journalctl -u "$caddy_service_name" -n "$tail_lines" --no-pager || true
    echo
    echo "== Disk =="
    df -h || true
    echo
    echo "== Firewall =="
    sudo ufw status verbose || true
    ;;
  caddy:validate)
    sudo caddy validate --config /etc/caddy/Caddyfile
    ;;
  caddy:reload)
    sudo caddy validate --config /etc/caddy/Caddyfile
    sudo systemctl reload "$caddy_service_name"
    ;;
  caddy:status)
    sudo systemctl status "$caddy_service_name" --no-pager
    ;;
  caddy:logs)
    sudo journalctl -u "$caddy_service_name" -n "$tail_lines" --no-pager
    ;;
  config:migrate)
    ensure_deployment_local_config || echo "$local_deployment_config already exists."
    migrated_username="$(toml_section_value "$local_deployment_config" "admin" "username")"
    migrated_password="$(toml_section_value "$local_deployment_config" "admin" "password")"
    if [[ "${#migrated_username}" -lt 2 || "${#migrated_password}" -lt 8 ]]; then
      echo "Edit $local_deployment_config and set [admin].username and [admin].password before starting the app."
    fi
    ;;
  config:edit)
    ensure_deployment_local_config || true
    "${EDITOR:-nano}" "$local_deployment_config"
    ;;
  domains:edit)
    "${EDITOR:-nano}" config/allowed-domains.txt
    ;;
  backup)
    make_backup
    ;;
  backup:list)
    if [[ -d "$backup_dir" ]]; then
      find "$backup_dir" -maxdepth 1 -type f -name 'planning-poker-backup-*.tar.gz' -printf '%TY-%Tm-%Td %TH:%TM %p\n' |
        sort -r |
        head -20
    else
      echo "No backup directory yet: $backup_dir"
    fi
    ;;
  backup:prune)
    prune_backups
    ;;
  restore)
    restore_backup "${2:-}"
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo >&2
    show_help >&2
    exit 1
    ;;
esac
