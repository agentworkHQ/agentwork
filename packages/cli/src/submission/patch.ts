import { execSync } from "node:child_process";

/** Auto-stage and commit any uncommitted changes, then generate patch from initial commit. */
export function generatePatch(sourceDir: string): string {
  // Check for uncommitted changes
  const status = execSync("git status --porcelain", {
    cwd: sourceDir,
    encoding: "utf-8",
  }).trim();

  if (status) {
    execSync("git add -A && git commit -m submission", {
      cwd: sourceDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
  }

  // Generate diff from initial commit (first commit) to HEAD
  const firstCommit = execSync("git rev-list --max-parents=0 HEAD", {
    cwd: sourceDir,
    encoding: "utf-8",
  }).trim();

  return execSync(`git diff ${firstCommit} HEAD`, {
    cwd: sourceDir,
    encoding: "utf-8",
  });
}
