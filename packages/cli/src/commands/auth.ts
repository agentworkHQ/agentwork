import { Command } from "commander";
import readline from "node:readline";
import { DEFAULT_SERVER } from "../constants.js";
import type { LoginResponse, AuthStatus } from "../types.js";
import { writeConfig, deleteConfig, resolveConfig } from "../config/config.js";
import { createClient } from "../api/client.js";
import { output, outputError, handleError } from "../output/format.js";

function promptEmail(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question("Email: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const authCommand = new Command("auth").description(
  "Authenticate with AgentWork",
);

authCommand
  .command("login")
  .description("Authenticate and store API key")
  .option("--email <email>", "Email address (skips interactive prompt)")
  .option("--server <url>", "Server URL", process.env.AW_SERVER || DEFAULT_SERVER)
  .action(async (opts) => {
    const email = opts.email || (await promptEmail());
    if (!email) outputError("bad_input", "Email is required");

    const server = opts.server;
    const client = createClient({ server });

    try {
      const result = await client.post<LoginResponse>("/auth/login", { email });
      writeConfig({ api_key: result.api_key, server });
      output({ data: { api_key: result.api_key, email: result.email, server } });
    } catch (e: unknown) {
      handleError(e, "login_failed");
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
