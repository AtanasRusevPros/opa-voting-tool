#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

cmd="${1:-help}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="$repo_root/infra/containers/compose.yaml"
service_name="planning-poker"
local_health_url="${LOCAL_HEALTH_URL:-http://127.0.0.1:3001/health}"
tracked_deployment_config="config/deployment.toml"
local_deployment_config="config/deployment.local.toml"
backup_dir="${BACKUP_DIR:-$repo_root/../backups}"
data_volume_name="${DATA_VOLUME_NAME:-containers_planning_poker_data}"
tail_lines="${TAIL:-200}"
backup_prune_keep="${BACKUP_PRUNE_KEEP:-20}"

cd "$repo_root"

active_deployment_config() {
  if [[ -f "$local_deployment_config" ]]; then
    echo "$local_deployment_config"
    return
  fi

  echo "$tracked_deployment_config"
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

public_url() {
  if [[ -n "${APP_URL:-}" ]]; then
    echo "${APP_URL%/}"
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

  echo "No public URL configured. Set APP_URL=https://your-host or [app].base_url in $local_deployment_config." >&2
  exit 1
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

wait_for_local_health() {
  for _ in $(seq 1 60); do
    if curl --max-time 5 -fsS "$local_health_url" >/dev/null 2>&1; then
      echo "Local health OK: $local_health_url"
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for local health: $local_health_url" >&2
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

show_help() {
  cat <<EOF
Usage: ./deploy.sh <command>

Purpose:
  VPS/operator helper for the deployed app. Run it from the repo checkout on the server,
  for example /opt/opa-voting-tool/app.

Environment overrides:
  APP_URL=http(s)://host      Public URL for public health checks. Defaults to config/deployment.local.toml base_url,
                              then config/deployment.toml. Required if neither config has [app].base_url.
  APP_CONFIG_DIR=path         Host config directory mounted into the app container. Default: $repo_root/config
  LOCAL_HEALTH_URL=url        Local app health URL. Default: $local_health_url
  BACKUP_DIR=path             Backup output directory. Default: $backup_dir
  DATA_VOLUME_NAME=name       Podman volume restored by restore. Default: $data_volume_name
  BACKUP_PRUNE_KEEP=count     Backups kept by backup:prune. Default: $backup_prune_keep
  BACKUP_PRUNE_DRY_RUN=1      Preview backup:prune without deleting files.
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
  ./deploy.sh health          Check local app health on 127.0.0.1:3001
  ./deploy.sh public-health   Check public HTTPS health through Caddy
  ./deploy.sh diagnose        Print app, Caddy, disk, firewall, and recent log diagnostics
  ./deploy.sh logs            Show recent app logs
  ./deploy.sh logs:follow     Follow app logs
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
  run_podman_compose down --remove-orphans || true
  restore_config_from_backup "$tmp_dir"
  restore_api_data_from_backup "$tmp_dir"
  ensure_super_admin_credentials
  run_podman_compose up -d
  wait_for_local_health
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
    run_podman_compose up -d
    wait_for_local_health
    ;;
  down)
    run_podman_compose down
    ;;
  restart)
    ensure_super_admin_credentials
    run_podman_compose restart "$service_name"
    wait_for_local_health
    ;;
  rebuild)
    ensure_super_admin_credentials
    run_podman_compose build --no-cache
    run_podman_compose up -d --force-recreate
    wait_for_local_health
    ;;
  update)
    prepare_git_update_config
    ensure_super_admin_credentials
    make_backup
    git pull --ff-only
    run_podman_compose build --no-cache
    run_podman_compose up -d --force-recreate
    wait_for_local_health
    ;;
  ps)
    run_podman_compose ps
    ;;
  health)
    curl --max-time 10 -fsS "$local_health_url"
    echo
    ;;
  public-health)
    curl --max-time 15 -fsS "$(public_url)/health"
    echo
    ;;
  logs)
    run_podman_compose logs --tail="$tail_lines" "$service_name"
    ;;
  logs:follow)
    run_podman_compose logs --tail="$tail_lines" -f "$service_name"
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
    echo "== Local health =="
    curl --max-time 10 -fsS "$local_health_url" || true
    echo
    echo "== Public health =="
    curl --max-time 15 -fsS "$(public_url)/health" || true
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
    echo "== Caddy status =="
    sudo systemctl status caddy --no-pager || true
    echo
    echo "== Recent Caddy logs =="
    sudo journalctl -u caddy -n "$tail_lines" --no-pager || true
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
    sudo systemctl reload caddy
    ;;
  caddy:status)
    sudo systemctl status caddy --no-pager
    ;;
  caddy:logs)
    sudo journalctl -u caddy -n "$tail_lines" --no-pager
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
