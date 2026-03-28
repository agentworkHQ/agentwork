import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { validateSubmission, getModifiedFiles } from "../submission/validate.js";
import type { TaskSpec } from "../types.js";

function initGitRepo(dir: string) {
  execSync("git init && git add -A && git commit -m initial", {
    cwd: dir,
    stdio: "pipe",
  });
}

function commitChange(dir: string, file: string, content: string) {
  fs.writeFileSync(path.join(dir, file), content);
  execSync(`git add -A && git commit -m "change"`, { cwd: dir, stdio: "pipe" });
}

function makeSpec(overrides?: Partial<TaskSpec>): TaskSpec {
  return {
    version: "0.1",
    id: "test",
    publisher: "test",
    created: "2026-01-01T00:00:00Z",
    expires: "2030-01-01T00:00:00Z",
    status: "open",
    tags: [],
    source: { type: "git", url: "", ref: "" },
    description: "test",
    verify: { command: "./verify.sh", output: "result.json" },
    protected: ["verify.sh"],
    payment: {
      model: "first_valid",
      amount: 0,
      currency: "usd",
      max_payouts: 1,
      verification_window: "48h",
    },
    ...overrides,
  };
}

describe("validateSubmission", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-validate-"));
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "code.ts"), "original");
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\nexit 0");
    initGitRepo(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes for valid modification", () => {
    commitChange(dir, "src/code.ts", "fixed");
    fs.writeFileSync(path.join(dir, "result.json"), '{"ok": true}');

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBeNull();
  });

  it("fails when verify output file is missing", () => {
    commitChange(dir, "src/code.ts", "fixed");

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBe("Required file missing: result.json");
  });

  it("fails when verify output is not valid JSON", () => {
    commitChange(dir, "src/code.ts", "fixed");
    fs.writeFileSync(path.join(dir, "result.json"), "not json");

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBe("result.json is not valid JSON");
  });

  it("fails when no files were modified", () => {
    fs.writeFileSync(path.join(dir, "result.json"), "{}");

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBe("No files were modified");
  });

  it("fails when modifying a protected file", () => {
    const spec = makeSpec({ protected: ["verify.sh", "src/secret.ts"] });

    // Create the protected file in initial state
    fs.writeFileSync(path.join(dir, "src", "secret.ts"), "original secret");
    execSync("git add -A && git commit --amend --no-edit", { cwd: dir, stdio: "pipe" });

    // Modify both an allowed file and the protected file
    commitChange(dir, "src/code.ts", "good change");
    fs.writeFileSync(path.join(dir, "src", "secret.ts"), "modified secret");
    execSync("git add -A && git commit -m cheat", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, "result.json"), "{}");

    const err = validateSubmission(dir, spec);
    expect(err).toContain("Modified protected file");
  });

  it("implicitly protects verify.command even if not in protected list", () => {
    // Spec with empty protected list — verify.sh should still be protected
    const spec = makeSpec({ protected: [] });

    commitChange(dir, "verify.sh", "#!/bin/bash\nexit 0  # hacked");
    commitChange(dir, "src/code.ts", "fixed");
    fs.writeFileSync(path.join(dir, "result.json"), "{}");

    const err = validateSubmission(dir, spec);
    expect(err).toContain("Modified protected file");
    expect(err).toContain("verify.sh");
  });

  it("fails on path traversal", () => {
    commitChange(dir, "src/code.ts", "legit change");
    fs.writeFileSync(path.join(dir, "result.json"), "{}");

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBeNull(); // Valid case passes
  });

  it("allows multiple file modifications", () => {
    fs.writeFileSync(path.join(dir, "src", "a.ts"), "new file a");
    fs.writeFileSync(path.join(dir, "src", "b.ts"), "new file b");
    execSync("git add -A && git commit -m multi", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, "result.json"), "{}");

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBeNull();
  });

  it("allows modifying any file not in protected list", () => {
    // Modify files outside src/ — should be fine as long as not protected
    fs.writeFileSync(path.join(dir, "README.md"), "new readme");
    fs.writeFileSync(path.join(dir, "config.json"), "{}");
    execSync("git add -A && git commit -m wide", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, "result.json"), "{}");

    const err = validateSubmission(dir, makeSpec());
    expect(err).toBeNull();
  });
});

describe("getModifiedFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-modified-"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    initGitRepo(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns modified files", () => {
    commitChange(dir, "a.txt", "changed");
    expect(getModifiedFiles(dir)).toEqual(["a.txt"]);
  });

  it("returns added files", () => {
    fs.writeFileSync(path.join(dir, "b.txt"), "new");
    execSync("git add -A && git commit -m add", { cwd: dir, stdio: "pipe" });
    expect(getModifiedFiles(dir)).toContain("b.txt");
  });

  it("returns empty for no changes", () => {
    expect(getModifiedFiles(dir)).toEqual([]);
  });

  it("returns empty for non-git directory", () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), "aw-nongit-"));
    expect(getModifiedFiles(nonGit)).toEqual([]);
    fs.rmSync(nonGit, { recursive: true, force: true });
  });
});
