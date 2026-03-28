import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify } from "yaml";
import {
  getTasksRoot,
  getTaskDir,
  getSourceDir,
  getSpecPath,
  readLocalSpec,
  taskExists,
} from "../workspace/workspace.js";
import type { TaskSpec } from "../types.js";

describe("workspace", () => {
  let awHome: string;

  beforeEach(() => {
    awHome = fs.mkdtempSync(path.join(os.tmpdir(), "aw-workspace-"));
    vi.stubEnv("AW_HOME", awHome);
  });

  afterEach(() => {
    fs.rmSync(awHome, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("getTasksRoot uses AW_HOME", () => {
    expect(getTasksRoot()).toBe(path.join(awHome, "tasks"));
  });

  it("getTaskDir returns correct path", () => {
    expect(getTaskDir("aw-task-123")).toBe(path.join(awHome, "tasks", "aw-task-123"));
  });

  it("getSourceDir returns correct path", () => {
    expect(getSourceDir("aw-task-123")).toBe(
      path.join(awHome, "tasks", "aw-task-123", "source"),
    );
  });

  it("getSpecPath returns correct path", () => {
    expect(getSpecPath("aw-task-123")).toBe(
      path.join(awHome, "tasks", "aw-task-123", "task.yaml"),
    );
  });

  it("taskExists returns false when task does not exist", () => {
    expect(taskExists("aw-task-nonexistent")).toBe(false);
  });

  it("taskExists returns true when source dir exists", () => {
    const sourceDir = getSourceDir("aw-task-abc");
    fs.mkdirSync(sourceDir, { recursive: true });
    expect(taskExists("aw-task-abc")).toBe(true);
  });

  it("readLocalSpec returns null when spec does not exist", () => {
    expect(readLocalSpec("aw-task-nonexistent")).toBeNull();
  });

  it("readLocalSpec reads and parses task.yaml", () => {
    const taskDir = getTaskDir("aw-task-xyz");
    fs.mkdirSync(taskDir, { recursive: true });

    const spec: Partial<TaskSpec> = {
      id: "aw-task-xyz",
      description: "test description",
      tags: ["test"],
    };
    fs.writeFileSync(path.join(taskDir, "task.yaml"), stringify(spec));

    const result = readLocalSpec("aw-task-xyz");
    expect(result?.id).toBe("aw-task-xyz");
    expect(result?.description).toBe("test description");
    expect(result?.tags).toEqual(["test"]);
  });
});
