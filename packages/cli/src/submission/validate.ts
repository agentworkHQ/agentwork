import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TaskSpec } from "../types.js";

/** Normalize verify command path to a file path (strip leading ./) */
function normalizeVerifyPath(command: string): string {
  return command.replace(/^\.\//, "");
}

/** Build the full protected set: explicit protected + implicit verify command */
function buildProtectedSet(spec: TaskSpec): string[] {
  const set = [...spec.protected];
  const verifyPath = normalizeVerifyPath(spec.verify.command);
  if (!set.includes(verifyPath)) {
    set.push(verifyPath);
  }
  return set;
}

export function validateSubmission(
  sourceDir: string,
  spec: TaskSpec,
): string | null {
  // Check verify output file exists (derived must_include)
  const outputFile = spec.verify.output;
  if (!fs.existsSync(path.join(sourceDir, outputFile))) {
    return `Required file missing: ${outputFile}`;
  }

  // Validate verify output is valid JSON
  const outputPath = path.join(sourceDir, outputFile);
  try {
    JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  } catch {
    return `${outputFile} is not valid JSON`;
  }

  // Get list of modified files from git (diff from initial commit)
  const modifiedFiles = getModifiedFiles(sourceDir);
  if (modifiedFiles.length === 0) {
    return "No files were modified";
  }

  // Check no path traversal
  for (const file of modifiedFiles) {
    if (file.includes("..")) {
      return `Path traversal detected: ${file}`;
    }
  }

  // Check no modifications to protected files
  const protectedPaths = buildProtectedSet(spec);
  for (const file of modifiedFiles) {
    const isProtected = protectedPaths.some(
      (pattern) => file === pattern || file.startsWith(pattern),
    );
    if (isProtected) {
      return `Modified protected file: ${file}`;
    }
  }

  return null;
}

export function getModifiedFiles(sourceDir: string): string[] {
  try {
    // Diff from first commit (initial state) to working tree
    const firstCommit = execSync("git rev-list --max-parents=0 HEAD", {
      cwd: sourceDir,
      encoding: "utf-8",
    }).trim();

    const output = execSync(`git diff --name-only ${firstCommit} HEAD`, {
      cwd: sourceDir,
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}
