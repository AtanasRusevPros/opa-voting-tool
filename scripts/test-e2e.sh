#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Atanas G. Rusev
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

compose_file="infra/containers/compose.yaml"
isolated_stack_data_dir="/tmp/planning-poker-packaged-test-data"

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
  if command -v podman >/dev/null 2>&1; then
    ensure_macos_podman_machine
    podman compose -f "$compose_file" "$@"
    return
  fi

  if command -v podman-compose >/dev/null 2>&1; then
    podman-compose -f "$compose_file" "$@"
    return
  fi

  echo "Podman is required for e2e tests." >&2
  exit 1
}

cleanup() {
  run_podman_compose down -v >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup
DATA_DIR="$isolated_stack_data_dir" E2E_DEBUG_CODES=1 run_podman_compose up -d --build

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
