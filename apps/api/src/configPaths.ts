// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, "../../..");

export const trackedDeploymentConfigName = "deployment.toml";
export const localDeploymentConfigName = "deployment.local.toml";

export function resolveDefaultDeploymentConfigPath(root = repoRoot): string {
  const configDir = path.join(root, "config");
  const localConfigPath = path.join(configDir, localDeploymentConfigName);
  if (fs.existsSync(localConfigPath)) {
    return localConfigPath;
  }
  return path.join(configDir, trackedDeploymentConfigName);
}

