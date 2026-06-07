#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

local_deployment_config="config/deployment.local.toml"
saved_local_config=""
backup_prune_test_dir=""

restore_local_deployment_config() {
  if [[ -n "$backup_prune_test_dir" && -d "$backup_prune_test_dir" ]]; then
    rm -rf "$backup_prune_test_dir"
  fi

  if [[ -n "$saved_local_config" && -f "$saved_local_config" ]]; then
    cp "$saved_local_config" "$local_deployment_config"
    rm -f "$saved_local_config"
    return
  fi

  rm -f "$local_deployment_config"
}

if [[ -f "$local_deployment_config" ]]; then
  saved_local_config="$(mktemp)"
  cp "$local_deployment_config" "$saved_local_config"
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
