import type { ApiError } from "../types.js";

export interface ClientConfig {
  server: string;
  apiKey?: string;
}

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function wrapFetchError(e: unknown, server: string): never {
  if (e instanceof ApiClientError) throw e;
  if (e instanceof TypeError) {
    throw new ApiClientError(
      "connection_failed",
      `Cannot reach server at ${server}. Is it running?`,
      0,
    );
  }
  throw new ApiClientError(
    "network_error",
    e instanceof Error ? e.message : String(e),
    0,
  );
}

export function createClient(config: ClientConfig) {
  const { server, apiKey } = config;

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (apiKey) h["authorization"] = `Bearer ${apiKey}`;
    return h;
  }

  async function request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; params?: Record<string, string> },
  ): Promise<T> {
    const url = new URL(path, server);
    if (options?.params) {
      for (const [k, v] of Object.entries(options.params)) {
        if (v) url.searchParams.set(k, v);
      }
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers: { "content-type": "application/json", ...authHeaders() },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (e: unknown) {
      wrapFetchError(e, server);
    }

    const json = await res.json();
    if (!res.ok) {
      const err = json as ApiError;
      throw new ApiClientError(
        err.error?.code || "unknown",
        err.error?.message || `HTTP ${res.status}`,
        res.status,
      );
    }
    return (json as { data: T }).data;
  }

  return {
    get<T>(path: string, params?: Record<string, string>) {
      return request<T>("GET", path, { params });
    },

    post<T>(path: string, body: unknown) {
      return request<T>("POST", path, { body });
    },

    async postMultipart<T>(path: string, formData: FormData): Promise<T> {
      const url = new URL(path, server);
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method: "POST",
          headers: authHeaders(),
          body: formData,
        });
      } catch (e: unknown) {
        wrapFetchError(e, server);
      }

      const json = await res.json();
      if (!res.ok) {
        const err = json as ApiError;
        throw new ApiClientError(
          err.error?.code || "unknown",
          err.error?.message || `HTTP ${res.status}`,
          res.status,
        );
      }
      return (json as { data: T }).data;
    },

    async getBuffer(path: string): Promise<Buffer> {
      const url = new URL(path, server);
      let res: Response;
      try {
        res = await fetch(url.toString(), { headers: authHeaders() });
      } catch (e: unknown) {
        wrapFetchError(e, server);
      }

      if (!res.ok) {
        const json = await res.json();
        const err = json as ApiError;
        throw new ApiClientError(
          err.error?.code || "unknown",
          err.error?.message || `HTTP ${res.status}`,
          res.status,
        );
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
