import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface PreflightResult {
  /** Whether verify.sh executed without crashing */
  executed: boolean;
  /** Exit code (0 = pass, non-zero = fail, null = crashed) */
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run verify.sh against unmodified source in a temp copy.
 *
 * Used by `aw task test` and as a pre-publish gate.
 * Two failure modes this catches:
 * 1. verify.sh crashes (broken script) → executed: false
 * 2. verify.sh passes on unmodified source (pre-solved or weak verification) → exitCode: 0
 *
 * The only good outcome: executed: true, exitCode: non-zero.
 */
export function runPreflight(
  sourceDir: string,
  verifyCommand: string,
): PreflightResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-preflight-"));
  const tmpSource = path.join(tmpDir, "source");

  try {
    // Copy source to temp directory
    execSync(`cp -R "${sourceDir}" "${tmpSource}"`, { stdio: "pipe" });

    // Make verify.sh executable
    const verifyPath = path.join(tmpSource, verifyCommand.replace("./", ""));
    if (fs.existsSync(verifyPath)) {
      fs.chmodSync(verifyPath, 0o755);
    }

    // Run verify command
    let stdout: string;
    let stderr: string;
    let exitCode: number;

    try {
      stdout = execSync(verifyCommand, {
        cwd: tmpSource,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      });
      exitCode = 0;
      stderr = "";
    } catch (e: unknown) {
      const err = e as { status?: number | null; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
      if (err.status === null || err.status === undefined || err.killed || err.signal) {
        // Process was killed or crashed (e.g., syntax error, signal)
        return {
          executed: false,
          exitCode: null,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
        };
      }
      exitCode = err.status;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
    }

    return { executed: true, exitCode, stdout, stderr };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
