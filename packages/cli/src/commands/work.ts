import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { stringify } from "yaml";
import type { TaskSpec, TaskSummary, SubmissionSummary } from "../types.js";
import { resolveConfig } from "../config/config.js";
import { createClient } from "../api/client.js";
import { output, outputError, handleError } from "../output/format.js";
import {
  getTaskDir,
  getTasksRoot,
  getSourceDir,
  getSpecPath,
  readLocalSpec,
  taskExists,
} from "../workspace/workspace.js";
import { runVerify } from "../verify/runner.js";
import { validateSubmission } from "../submission/validate.js";
import { generatePatch } from "../submission/patch.js";

function requireAuth() {
  const config = resolveConfig();
  if (!config) outputError("not_authenticated", "Run `aw auth login` first");
  return config;
}

export const workCommand = new Command("work").description(
  "Find and work on tasks",
);

workCommand
  .command("list")
  .description("List locally taken tasks")
  .action(() => {
    const root = getTasksRoot();
    let dirs: string[] = [];
    try {
      dirs = fs.readdirSync(root).filter((d) => {
        return fs.existsSync(path.join(root, d, "task.yaml"));
      });
    } catch {
      // tasks dir doesn't exist yet
    }

    const tasks = dirs.map((id) => {
      const spec = readLocalSpec(id);
      return {
        task_id: id,
        description: spec?.description?.slice(0, 120) || "unknown",
        tags: spec?.tags || [],
        payment: spec?.payment
          ? { model: spec.payment.model, amount: spec.payment.amount }
          : null,
      };
    });

    output({ data: tasks });
  });

workCommand
  .command("browse")
  .description("Browse open tasks")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--min-payout <amount>", "Minimum payout amount")
  .action(async (opts) => {
    const config = requireAuth();
    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    const params: Record<string, string> = {};
    if (opts.tags) params.tags = opts.tags;
    if (opts.minPayout) params.min_payout = opts.minPayout;

    try {
      const tasks = await client.get<TaskSummary[]>("/feed", params);
      output({ data: tasks });
    } catch (e: unknown) {
      handleError(e, "browse_failed");
    }
  });

workCommand
  .command("inspect")
  .description("View task details")
  .argument("<task-id>", "Task ID")
  .option("--full", "Show full spec JSON")
  .action(async (taskId, opts) => {
    const config = requireAuth();
    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    try {
      const task = await client.get<TaskSpec>(`/tasks/${taskId}`);

      if (opts.full) {
        output({ data: task });
      } else {
        output({
          data: {
            id: task.id,
            publisher: task.publisher,
            description: task.description,
            tags: task.tags,
            payment: task.payment,
            protected: task.protected,
            expires: task.expires,
            status: task.status,
          },
        });
      }
    } catch (e: unknown) {
      handleError(e, "inspect_failed");
    }
  });

workCommand
  .command("take")
  .description("Download task source to work on locally")
  .argument("<task-id>", "Task ID")
  .action(async (taskId) => {
    const config = requireAuth();
    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    if (taskExists(taskId)) {
      outputError("already_taken", `Task ${taskId} already exists locally`);
    }

    const log = (msg: string) => process.stderr.write(`${msg}\n`);

    try {
      log("Fetching task spec...");
      const task = await client.get<TaskSpec>(`/tasks/${taskId}`);

      const taskDir = getTaskDir(taskId);
      const sourceDir = getSourceDir(taskId);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(getSpecPath(taskId), stringify(task), "utf-8");

      log("Downloading source...");
      const archive = await client.getBuffer(`/tasks/${taskId}/source`);
      const archivePath = `${taskDir}/source.tar.gz`;
      fs.writeFileSync(archivePath, archive);

      log("Extracting...");
      execSync(`tar -xzf source.tar.gz -C source`, { cwd: taskDir });
      fs.unlinkSync(archivePath);

      // Add standard gitignore if not present
      const gitignorePath = `${sourceDir}/.gitignore`;
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(
          gitignorePath,
          "node_modules/\ndist/\npackage-lock.json\nresult.json\n",
          "utf-8",
        );
      }

      log("Initializing workspace...");
      execSync("git init && git add -A && git commit -m initial", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      log("Ready.");
      output({
        data: { task_id: taskId, local_path: taskDir, status: "ready" },
      });
    } catch (e: unknown) {
      handleError(e, "take_failed");
    }
  });

workCommand
  .command("verify")
  .description("Run verification locally (dry-run)")
  .argument("<task-id>", "Task ID")
  .action((taskId) => {
    const spec = readLocalSpec(taskId);
    if (!spec) {
      outputError("not_taken", `Task ${taskId} not found locally. Run 'aw work take' first.`);
    }

    const sourceDir = getSourceDir(taskId);
    const result = runVerify(sourceDir, spec.verify.command, spec.verify.output);
    output({ data: result });

    if (!result.pass) process.exit(1);
  });

workCommand
  .command("submit")
  .description("Submit work for verification")
  .argument("<task-id>", "Task ID")
  .action(async (taskId) => {
    const config = requireAuth();
    const spec = readLocalSpec(taskId);
    if (!spec) {
      outputError("not_taken", `Task ${taskId} not found locally. Run 'aw work take' first.`);
    }

    const sourceDir = getSourceDir(taskId);

    // Run verify first (creates result.json)
    const verifyResult = runVerify(
      sourceDir,
      spec.verify.command,
      spec.verify.output,
    );
    if (!verifyResult.pass) {
      outputError("verify_failed", "Verification failed. Cannot submit.");
    }

    // Generate artifact (auto-stages and commits uncommitted changes)
    const patch = generatePatch(sourceDir);
    if (!patch.trim()) {
      outputError("no_changes", "No changes to submit");
    }

    // Validate submission (after auto-commit so git diff is accurate)
    const validationError = validateSubmission(sourceDir, spec);
    if (validationError) {
      outputError("validation_error", validationError);
    }

    // Upload
    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    // Derive submission format from source type
    const isArchive = spec.source.type === "archive";
    const formData = new FormData();
    formData.set(
      "artifact",
      new Blob([patch], { type: "text/plain" }),
      isArchive ? "submission.tar.gz" : "submission.patch",
    );
    if (verifyResult.value !== null) {
      formData.set("value", String(verifyResult.value));
    }
    if (verifyResult.result) {
      formData.set("result", JSON.stringify(verifyResult.result));
    }

    try {
      const submission = await client.postMultipart(
        `/tasks/${taskId}/submissions`,
        formData,
      );
      output({ data: submission });
    } catch (e: unknown) {
      handleError(e, "submit_failed");
    }
  });

workCommand
  .command("status")
  .description("Check task and submission status")
  .argument("<task-id>", "Task ID")
  .action(async (taskId) => {
    const config = requireAuth();
    const spec = readLocalSpec(taskId);
    const client = createClient({
      server: config.server,
      apiKey: config.api_key,
    });

    try {
      const task = await client.get<TaskSpec>(`/tasks/${taskId}`);
      const submissions = await client.get<SubmissionSummary[]>(
        `/tasks/${taskId}/submissions`,
      );

      output({
        data: {
          task_id: taskId,
          task_status: task.status,
          local: spec !== null,
          submissions,
        },
      });
    } catch (e: unknown) {
      handleError(e, "status_failed");
    }
  });
