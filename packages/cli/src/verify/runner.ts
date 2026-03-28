import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface VerifyResult {
  exit_code: number;
  pass: boolean;
  value: number | null;
  result: unknown;
}

export function runVerify(
  sourceDir: string,
  command: string,
  outputFile: string,
): VerifyResult {
  let stdout: string;
  let exitCode: number;

  try {
    stdout = execSync(command, {
      cwd: sourceDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
    exitCode = 0;
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string };
    exitCode = err.status ?? 1;
    stdout = err.stdout ?? "";
  }

  // Parse last line of stdout as the value
  const lines = stdout.trim().split("\n");
  const lastLine = lines[lines.length - 1]?.trim() ?? "";
  const value = parseFloat(lastLine);

  // Read result file
  let result: unknown = null;
  const resultPath = path.join(sourceDir, outputFile);
  try {
    result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
  } catch {
    // result.json may not exist yet if verify failed
  }

  return {
    exit_code: exitCode,
    pass: exitCode === 0,
    value: isNaN(value) ? null : value,
    result,
  };
}
