import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { TASKS_DIR } from "../constants.js";
import type { TaskSpec } from "../types.js";
import { getAwHome } from "../config/config.js";

export function getTasksRoot(): string {
  return path.join(getAwHome(), TASKS_DIR);
}

export function getTaskDir(taskId: string): string {
  return path.join(getTasksRoot(), taskId);
}

export function getSourceDir(taskId: string): string {
  return path.join(getTaskDir(taskId), "source");
}

export function getSpecPath(taskId: string): string {
  return path.join(getTaskDir(taskId), "task.yaml");
}

export function readLocalSpec(taskId: string): TaskSpec | null {
  try {
    const raw = fs.readFileSync(getSpecPath(taskId), "utf-8");
    return parse(raw) as TaskSpec;
  } catch {
    return null;
  }
}

export function taskExists(taskId: string): boolean {
  return fs.existsSync(getSourceDir(taskId));
}
