import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runPreflight } from "../verify/preflight.js";

describe("runPreflight", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-preflight-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports correctly failing verification (the good outcome)", () => {
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\necho 0\nexit 1",
      { mode: 0o755 },
    );

    const result = runPreflight(dir, "./verify.sh");
    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it("detects passing verification (pre-solved source)", () => {
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\necho 'all good'\nexit 0",
      { mode: 0o755 },
    );

    const result = runPreflight(dir, "./verify.sh");
    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("detects crashing script (syntax error)", () => {
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\n(((",
      { mode: 0o755 },
    );

    const result = runPreflight(dir, "./verify.sh");
    // Bash syntax error exits with status 2, which counts as executed + failed
    // But the key thing: it didn't exit 0
    expect(result.exitCode).not.toBe(0);
  });

  it("detects missing verify script", () => {
    // No verify.sh at all — shell returns 127 (command not found)
    const result = runPreflight(dir, "./verify.sh");
    expect(result.exitCode).not.toBe(0);
  });

  it("does not modify the original source directory", () => {
    const marker = path.join(dir, "original_marker.txt");
    fs.writeFileSync(marker, "original");
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\necho 'modified' > original_marker.txt\nexit 1",
      { mode: 0o755 },
    );

    runPreflight(dir, "./verify.sh");

    // Original file should be untouched
    expect(fs.readFileSync(marker, "utf-8")).toBe("original");
  });

  it("handles non-zero exit codes other than 1", () => {
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\nexit 42",
      { mode: 0o755 },
    );

    const result = runPreflight(dir, "./verify.sh");
    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(42);
  });

  it("captures stdout", () => {
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\necho 'test output'\nexit 1",
      { mode: 0o755 },
    );

    const result = runPreflight(dir, "./verify.sh");
    expect(result.stdout).toContain("test output");
  });

});
