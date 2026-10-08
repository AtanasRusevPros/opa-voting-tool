#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
# Exercise the actual preflight against real local repositories, without touching a deployment.
sed -n '/^check_source_update() {$/,/^}$/p' "$repo_root/deploy.sh" > "$fixture/check.sh"
cat >> "$fixture/check.sh" <<'CHECK'
check_source_update
echo UPDATE_REQUIRED
CHECK
git init --bare -q "$fixture/remote.git"
git clone -q "$fixture/remote.git" "$fixture/author" 2>/dev/null
git -C "$fixture/author" config user.name 'Update Test'
git -C "$fixture/author" config user.email 'update@example.invalid'
echo first > "$fixture/author/source"
git -C "$fixture/author" add source
git -C "$fixture/author" commit -qm first
git -C "$fixture/author" push -q origin HEAD
git clone -q "$fixture/remote.git" "$fixture/deployed"
cd "$fixture/deployed"
result="$(bash -e "$fixture/check.sh" 2>&1)"
[[ "$result" == *"Already up to date"* && "$result" != *UPDATE_REQUIRED* ]]
[[ "$result" == *"./deploy.sh rebuild"* ]]
# A new remote commit must be fetched and detected without changing local HEAD.
old_head="$(git rev-parse HEAD)"
echo second >> "$fixture/author/source"
git -C "$fixture/author" commit -qam second
git -C "$fixture/author" push -q origin HEAD
result="$(bash -e "$fixture/check.sh" 2>&1)"
[[ "$result" == *UPDATE_REQUIRED* && "$result" != *"Already up to date"* ]]
[[ "$(git rev-parse HEAD)" == "$old_head" ]]
git pull -q --ff-only
result="$(bash -e "$fixture/check.sh" 2>&1)"
[[ "$result" == *"Already up to date"* && "$result" != *UPDATE_REQUIRED* ]]
# Failed fetch must never claim up-to-date or proceed to deployment.
git remote set-url origin "$fixture/missing.git"
if result="$(bash -e "$fixture/check.sh" 2>&1)"; then exit 1; fi
[[ "$result" != *"Already up to date"* && "$result" != *UPDATE_REQUIRED* ]]
git branch --unset-upstream
if result="$(bash -e "$fixture/check.sh" 2>&1)"; then exit 1; fi
[[ "$result" != *"Already up to date"* && "$result" != *UPDATE_REQUIRED* ]]
echo 'Deployment update preflight tests passed.'
