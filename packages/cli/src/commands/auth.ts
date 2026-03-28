import { Command } from "commander";
import readline from "node:readline";
import { DEFAULT_SERVER } from "../constants.js";
import type { LoginResponse, AuthStatus } from "../types.js";
import { writeConfig, deleteConfig, resolveConfig } from "../config/config.js";
import { createClient } from "../api/client.js";
import { output, outputError, handleError } from "../output/format.js";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const authCommand = new Command("auth").description(
  "Authenticate with AgentWork",
);

// aw auth login --email you@example.com
// Sends a verification code. If --email is omitted, prompts interactively.
// If run interactively (no --code), waits for code input and completes auth.
authCommand
  .command("login")
  .description("Request a verification code")
  .option("--email <email>", "Email address")
  .option("--server <url>", "Server URL", process.env.AW_SERVER || DEFAULT_SERVER)
  .action(async (opts) => {
    const email = opts.email || (await prompt("Email: "));
    if (!email) outputError("bad_input", "Email is required");

    const server = opts.server;
    const client = createClient({ server });

    try {
      await client.post("/auth/login", { email });
      process.stderr.write(`Code sent to ${email}\n`);

      // Interactive convenience: if stdin is a TTY, prompt for code and complete auth
      if (process.stdin.isTTY) {
        const code = await prompt("Enter the 6-digit code: ");
        if (!code) outputError("bad_input", "Code is required");

        const result = await client.post<LoginResponse>("/auth/verify", { email, code });
        writeConfig({ api_key: result.api_key, server });
        output({ data: { api_key: result.api_key, email: result.email, server } });
      } else {
        output({ data: { message: "Code sent", email } });
      }
    } catch (e: unknown) {
      handleError(e, "login_failed");
    }
  });

// aw auth verify --email you@example.com --code 424310
// Verifies the code and stores the API key. Fully non-interactive.
authCommand
  .command("verify")
  .description("Verify a code and store API key")
  .requiredOption("--email <email>", "Email address")
  .requiredOption("--code <code>", "6-digit verification code")
  .option("--server <url>", "Server URL", process.env.AW_SERVER || DEFAULT_SERVER)
  .action(async (opts) => {
    const server = opts.server;
    const client = createClient({ server });

    try {
      const result = await client.post<LoginResponse>("/auth/verify", {
        email: opts.email,
        code: opts.code,
      });
      writeConfig({ api_key: result.api_key, server });
      output({ data: { api_key: result.api_key, email: result.email, server } });
    } catch (e: unknown) {
      handleError(e, "verify_failed");
    }
  });

authCommand
  .command("status")
  .description("Check current authentication status")
  .action(async () => {
    const config = resolveConfig();
    if (!config) outputError("not_authenticated", "Run `aw auth login` first");

    const client = createClient({ server: config.server, apiKey: config.api_key });

    try {
      const result = await client.get<AuthStatus>("/auth/status");
      output({ data: result });
    } catch (e: unknown) {
      handleError(e, "status_failed");
    }
  });

authCommand
  .command("logout")
  .description("Clear stored credentials")
  .action(() => {
    deleteConfig();
    output({ data: { message: "Logged out" } });
  });
