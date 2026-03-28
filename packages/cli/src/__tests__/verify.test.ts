import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runVerify } from "../verify/runner.js";

describe("runVerify", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-verify-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("captures exit 0 as pass", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\necho 42\nexit 0", { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "result.json"), '{"ok": true}');

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.exit_code).toBe(0);
    expect(result.pass).toBe(true);
    expect(result.value).toBe(42);
    expect(result.result).toEqual({ ok: true });
  });

  it("captures exit 1 as fail", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\necho 0\nexit 1", { mode: 0o755 });

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.exit_code).toBe(1);
    expect(result.pass).toBe(false);
    expect(result.value).toBe(0);
  });

  it("parses last line of stdout as value", () => {
    fs.writeFileSync(
      path.join(dir, "verify.sh"),
      "#!/bin/bash\necho 'some output'\necho 'more output'\necho 17",
      { mode: 0o755 },
    );

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.value).toBe(17);
  });

  it("returns null value when last line is not a number", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\necho 'done'", { mode: 0o755 });

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.value).toBeNull();
  });

  it("returns null result when result file does not exist", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\necho 1\nexit 0", { mode: 0o755 });

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.pass).toBe(true);
    expect(result.result).toBeNull();
  });

  it("returns null result when result file is invalid JSON", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\necho 1\nexit 0", { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "result.json"), "not json");

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.result).toBeNull();
  });

  it("handles script that produces no output", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\nexit 0", { mode: 0o755 });

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.pass).toBe(true);
    expect(result.value).toBeNull();
  });

  it("handles non-zero exit codes other than 1", () => {
    fs.writeFileSync(path.join(dir, "verify.sh"), "#!/bin/bash\nexit 2", { mode: 0o755 });

    const result = runVerify(dir, "./verify.sh", "result.json");
    expect(result.exit_code).toBe(2);
    expect(result.pass).toBe(false);
  });
});
