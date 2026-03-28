import { describe, it, expect } from "vitest";
import { createClient, ApiClientError } from "../api/client.js";

describe("API Client", () => {
  it("throws connection error when server is unreachable", async () => {
    const client = createClient({ server: "http://localhost:1" });
    try {
      await client.get("/anything");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiClientError);
      expect((e as ApiClientError).code).toBe("connection_failed");
      expect((e as ApiClientError).message).toContain("Cannot reach server");
      expect((e as ApiClientError).status).toBe(0);
    }
  });

  it("connection error on post", async () => {
    const client = createClient({ server: "http://localhost:1" });
    await expect(client.post("/x", {})).rejects.toThrow(ApiClientError);
  });

  it("connection error on postMultipart", async () => {
    const client = createClient({ server: "http://localhost:1" });
    await expect(client.postMultipart("/x", new FormData())).rejects.toThrow(
      ApiClientError,
    );
  });

  it("connection error on getBuffer", async () => {
    const client = createClient({ server: "http://localhost:1" });
    await expect(client.getBuffer("/x")).rejects.toThrow(ApiClientError);
  });
});
