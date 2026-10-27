#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/archive/config" "$fixture/temp space"
printf 'synthetic restored setting\n' > "$fixture/archive/config/setting"
tar -czf "$fixture/backup.tar.gz" -C "$fixture/archive" .
# Test the real orchestration/EXIT cleanup; isolate host/Podman actions.
sed -n '/^restore_backup() [({]$/,/^[})]$/p' "$repo_root/deploy.sh" > "$fixture/restore.sh"
cat >> "$fixture/restore.sh" <<'CHECK'
confirm_restore() { :; }
mark_planned_action() { :; }
run_podman_compose() { :; }
restore_config_from_backup() { cp "$1/config/setting" "$RESULT_FILE"; }
restore_api_data_from_backup() { :; }
ensure_super_admin_credentials() { :; }
wait_for_local_health() { return "${HEALTH_RESULT:-0}"; }
maybe_auto_enable_keepalive() { :; }
clear_planned_action() { :; }
restore_backup "$1"
CHECK
export TMPDIR="$fixture/temp space" RESULT_FILE="$fixture/restored"
if ! output="$(bash -eu "$fixture/restore.sh" "$fixture/backup.tar.gz" 2>&1)"; then
  printf 'Restore success path failed: %s\n' "$output" >&2
  exit 1
fi
[[ "$output" == *'Restore complete.'* ]]
cmp "$fixture/archive/config/setting" "$RESULT_FILE"
[[ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]]
# Failure after extraction also cleans up and must not claim success.
if output="$(HEALTH_RESULT=7 bash -eu "$fixture/restore.sh" "$fixture/backup.tar.gz" 2>&1)"; then exit 1; fi
[[ "$output" != *'Restore complete.'* && "$output" != *'unbound variable'* ]]
[[ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]]
printf 'not an archive' > "$fixture/bad.tar.gz"
if output="$(bash -eu "$fixture/restore.sh" "$fixture/bad.tar.gz" 2>&1)"; then exit 1; fi
[[ "$output" != *'Restore complete.'* && "$output" != *'unbound variable'* ]]
[[ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]]
echo 'Deployment restore cleanup tests passed.'
