import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { generatePatch } from "../submission/patch.js";

function initGitRepo(dir: string) {
  execSync("git init && git add -A && git commit -m initial", {
    cwd: dir,
    stdio: "pipe",
  });
}

describe("generatePatch", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-patch-"));
    fs.writeFileSync(path.join(dir, "file.txt"), "original content");
    initGitRepo(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("generates diff for committed changes", () => {
    fs.writeFileSync(path.join(dir, "file.txt"), "modified content");
    execSync("git add -A && git commit -m change", { cwd: dir, stdio: "pipe" });

    const patch = generatePatch(dir);
    expect(patch).toContain("original content");
    expect(patch).toContain("modified content");
    expect(patch).toContain("diff --git");
  });

  it("auto-commits uncommitted changes", () => {
    fs.writeFileSync(path.join(dir, "file.txt"), "uncommitted change");
    // NOT committing — generatePatch should auto-commit

    const patch = generatePatch(dir);
    expect(patch).toContain("uncommitted change");
    expect(patch).toContain("diff --git");

    // Verify git log shows the auto-commit
    const log = execSync("git log --oneline", { cwd: dir, encoding: "utf-8" });
    expect(log).toContain("submission");
  });

  it("handles new files", () => {
    fs.writeFileSync(path.join(dir, "new.txt"), "new file");
    execSync("git add -A && git commit -m add", { cwd: dir, stdio: "pipe" });

    const patch = generatePatch(dir);
    expect(patch).toContain("new.txt");
    expect(patch).toContain("new file");
  });

  it("returns empty string when no changes from initial", () => {
    const patch = generatePatch(dir);
    expect(patch.trim()).toBe("");
  });

  it("includes all commits since initial", () => {
    fs.writeFileSync(path.join(dir, "file.txt"), "change 1");
    execSync("git add -A && git commit -m c1", { cwd: dir, stdio: "pipe" });

    fs.writeFileSync(path.join(dir, "file.txt"), "change 2");
    execSync("git add -A && git commit -m c2", { cwd: dir, stdio: "pipe" });

    const patch = generatePatch(dir);
    // Final diff should show original → change 2 (cumulative)
    expect(patch).toContain("change 2");
    expect(patch).not.toContain("change 1"); // intermediate state not in final diff
  });

  it("does not auto-commit when nothing is uncommitted", () => {
    fs.writeFileSync(path.join(dir, "file.txt"), "committed change");
    execSync("git add -A && git commit -m explicit", { cwd: dir, stdio: "pipe" });

    const logBefore = execSync("git log --oneline", { cwd: dir, encoding: "utf-8" });
    generatePatch(dir);
    const logAfter = execSync("git log --oneline", { cwd: dir, encoding: "utf-8" });

    // No extra "submission" commit should appear
    expect(logBefore).toBe(logAfter);
  });
});
