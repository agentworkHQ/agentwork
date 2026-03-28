import { Command } from "commander";
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { parse } from "yaml";
import type { TaskSpec, Submission, SubmissionSummary } from "../types.js";
import { resolveConfig } from "../config/config.js";
import { createClient } from "../api/client.js";
import { output, outputError, handleError } from "../output/format.js";
import { runPreflight } from "../verify/preflight.js";

function readSpec(specPath: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(specPath, "utf-8");
  } catch {
    outputError("file_not_found", `Cannot read spec file: ${specPath}`);
  }

  try {
    return parse(raw!) as Record<string, unknown>;
  } catch {
    outputError("parse_error", "Spec file is not valid YAML");
  }
}

interface SpecFields {
  verify: { command: string };
}

function preflightCheck(sourceDir: string, spec: Record<string, unknown>): void {
  const s = spec as unknown as SpecFields;
  const verifyCommand = s.verify?.command;
  if (!verifyCommand) {
    outputError("invalid_spec", "Spec is missing verify.command");
  }

  const log = (msg: string) => process.stderr.write(`${msg}\n`);

  log("Running pre-publish verification...");
  const result = runPreflight(sourceDir, verifyCommand);

  if (!result.executed) {
    log("");
    log("CRASH — verify.sh failed to execute.");
    if (result.stderr) log(result.stderr.slice(0, 500));
    outputError("preflight_crash", "verify.sh crashed on unmodified source. Fix your verification script before publishing.");
  }

  if (result.exitCode === 0) {
    log("");
    log("PASS — verify.sh passes on unmodified source.");
    log("This means either the task is already solved or your verification doesn't test anything.");
    outputError("preflight_pass", "verify.sh must fail on unmodified source. The task should require work to pass.");
  }

  log("Preflight OK — verify.sh correctly rejects unmodified source.");
}

export const taskCommand = new Command("task").description("Manage tasks");

taskCommand
  .command("test")
  .description("Test verify.sh against unmodified source (pre-publish check)")
  .requiredOption("--spec <path>", "Path to task YAML spec")
  .requiredOption("--source <dir>", "Source directory")
  .action((opts) => {
    const spec = readSpec(opts.spec);
    const sourceDir = path.resolve(opts.source);
    if (!fs.existsSync(sourceDir)) {
      outputError("file_not_found", `Source directory not found: ${opts.source}`);
    }

    const s = spec as unknown as SpecFields;
    const verifyCommand = s.verify?.command;
    if (!verifyCommand) {
      outputError("invalid_spec", "Spec is missing verify.command");
    }

    const result = runPreflight(sourceDir, verifyCommand);

    if (!result.executed) {
      output({
        data: {
          status: "crash",
          message: "verify.sh failed to execute on unmodified source",
          stderr: result.stderr.slice(0, 1000),
        },
      });
      process.exit(1);
    }

    if (result.exitCode === 0) {
      output({
        data: {
          status: "pass",
          message: "verify.sh passes on unmodified source — task is pre-solved or verification is too weak",
          exitCode: 0,
        },
      });
      process.exit(1);
    }

    output({
      data: {
        status: "fail",
        message: "Good — verify.sh correctly rejects unmodified source",
        exitCode: result.exitCode,
      },
    });
  });

taskCommand
  .command("publish")
  .description("Publish a task from a YAML spec file")
  .requiredOption("--spec <path>", "Path to task YAML spec")
  .option("--source <dir>", "Source directory to archive and upload")
  .option("--force", "Skip pre-publish verification check")
  .action(async (opts) => {
    const config = resolveConfig();
    if (!config) outputError("not_authenticated", "Run `aw auth login` first");

    const spec = readSpec(opts.spec);

    // Pre-publish verification (only for archive tasks with --source)
    if (opts.source && !opts.force) {
      const sourceDir = path.resolve(opts.source);
      if (!fs.existsSync(sourceDir)) {
        outputError("file_not_found", `Source directory not found: ${opts.source}`);
      }
      preflightCheck(sourceDir, spec);
    }

    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    try {
      if (opts.source) {
        // Multipart: spec + source archive
        const sourceDir = path.resolve(opts.source);
        if (!fs.existsSync(sourceDir)) {
          outputError("file_not_found", `Source directory not found: ${opts.source}`);
        }

        // Create tar.gz in temp directory
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-"));
        const archivePath = path.join(tmpDir, "source.tar.gz");
        execSync(`tar -czf "${archivePath}" -C "${sourceDir}" .`, {
          stdio: "pipe",
        });

        const archiveBuffer = fs.readFileSync(archivePath);
        fs.rmSync(tmpDir, { recursive: true });

        const formData = new FormData();
        formData.set("spec", JSON.stringify(spec!));
        formData.set(
          "source",
          new Blob([archiveBuffer], { type: "application/gzip" }),
          "source.tar.gz",
        );

        const task = await client.postMultipart<TaskSpec>("/tasks", formData);
        output({ data: task });
      } else {
        // JSON only (git source)
        const task = await client.post<TaskSpec>("/tasks", spec!);
        output({ data: task });
      }
    } catch (e: unknown) {
      handleError(e, "publish_failed");
    }
  });

taskCommand
  .command("submissions")
  .description("List submissions for a task")
  .argument("<task-id>", "Task ID")
  .action(async (taskId) => {
    const config = resolveConfig();
    if (!config) outputError("not_authenticated", "Run `aw auth login` first");

    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    try {
      const subs = await client.get<SubmissionSummary[]>(
        `/tasks/${taskId}/submissions`,
      );
      output({ data: subs });
    } catch (e: unknown) {
      handleError(e, "submissions_failed");
    }
  });

taskCommand
  .command("approve")
  .description("Approve a submission")
  .argument("<task-id>", "Task ID")
  .argument("<submission-id>", "Submission ID")
  .action(async (taskId, submissionId) => {
    const config = resolveConfig();
    if (!config) outputError("not_authenticated", "Run `aw auth login` first");

    const client = createClient({ server: config.server, apiKey: config.api_key });

    try {
      const sub = await client.post<Submission>(
        `/tasks/${taskId}/submissions/${submissionId}/approve`,
        {},
      );
      output({ data: sub });
    } catch (e: unknown) {
      handleError(e, "approve_failed");
    }
  });

taskCommand
  .command("dispute")
  .description("Dispute a submission")
  .argument("<task-id>", "Task ID")
  .argument("<submission-id>", "Submission ID")
  .requiredOption("--reason <reason>", "Reason for dispute")
  .action(async (taskId, submissionId, opts) => {
    const config = resolveConfig();
    if (!config) outputError("not_authenticated", "Run `aw auth login` first");

    const client = createClient({ server: config.server, apiKey: config.api_key });

    try {
      const sub = await client.post<Submission>(
        `/tasks/${taskId}/submissions/${submissionId}/dispute`,
        { reason: opts.reason },
      );
      output({ data: sub });
    } catch (e: unknown) {
      handleError(e, "dispute_failed");
    }
  });
