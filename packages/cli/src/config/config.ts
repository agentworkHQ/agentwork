import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse, stringify } from "yaml";
import { CONFIG_DIR, CONFIG_FILE, DEFAULT_SERVER } from "../constants.js";

export interface Config {
  api_key: string;
  server: string;
}

/** Base directory: AW_HOME env var or ~/.aw */
export function getAwHome(): string {
  return process.env.AW_HOME || path.join(os.homedir(), CONFIG_DIR);
}

function getConfigPath(): string {
  return path.join(getAwHome(), CONFIG_FILE);
}

export function readConfig(): Config | null {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return parse(raw) as Config;
  } catch {
    return null;
  }
}

export function writeConfig(config: Config): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, stringify(config), "utf-8");
}

export function deleteConfig(): void {
  try {
    fs.unlinkSync(getConfigPath());
  } catch {
    // already gone
  }
}

/**
 * Resolve config with layered precedence:
 * 1. Explicit flags (--api-key, --server)
 * 2. Env vars (AW_API_KEY, AW_SERVER)
 * 3. Config file (~/.aw/config.yaml or AW_HOME/config.yaml)
 */
export function resolveConfig(flags?: {
  apiKey?: string;
  server?: string;
}): Config | null {
  const file = readConfig();

  const apiKey =
    flags?.apiKey || process.env.AW_API_KEY || file?.api_key || null;
  const server =
    flags?.server || process.env.AW_SERVER || file?.server || DEFAULT_SERVER;

  if (!apiKey) return null;
  return { api_key: apiKey, server };
}
