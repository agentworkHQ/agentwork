import { ApiClientError } from "../api/client.js";

export function output(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function outputError(code: string, message: string): never {
  process.stderr.write(
    JSON.stringify({ error: { code, message } }, null, 2) + "\n",
  );
  process.exit(1);
}

export function handleError(e: unknown, fallbackCode: string): never {
  if (e instanceof ApiClientError) {
    outputError(e.code, e.message);
  }
  outputError(fallbackCode, e instanceof Error ? e.message : String(e));
}
