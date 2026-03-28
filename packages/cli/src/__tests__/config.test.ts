import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readConfig, writeConfig, deleteConfig, resolveConfig } from "../config/config.js";

describe("Config", () => {
  const configDir = path.join(os.homedir(), ".aw");
  const configPath = path.join(configDir, "config.yaml");
  let backup: string | null = null;

  beforeEach(() => {
    // Back up existing config if present
    try {
      backup = fs.readFileSync(configPath, "utf-8");
    } catch {
      backup = null;
    }
  });

  afterEach(() => {
    // Restore original config
    if (backup !== null) {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, backup, "utf-8");
    } else {
      try {
        fs.unlinkSync(configPath);
      } catch {
        // ignore
      }
    }
    vi.unstubAllEnvs();
  });

  it("writes and reads config", () => {
    writeConfig({ api_key: "aw_dev_test123", server: "http://localhost:3000" });
    const config = readConfig();
    expect(config).toEqual({
      api_key: "aw_dev_test123",
      server: "http://localhost:3000",
    });
  });

  it("returns null when config does not exist", () => {
    deleteConfig();
    expect(readConfig()).toBeNull();
  });

  it("deletes config", () => {
    writeConfig({ api_key: "aw_dev_test123", server: "http://localhost:3000" });
    deleteConfig();
    expect(readConfig()).toBeNull();
  });

  describe("resolveConfig", () => {
    it("returns null when no config available", () => {
      deleteConfig();
      expect(resolveConfig()).toBeNull();
    });

    it("reads from config file", () => {
      writeConfig({
        api_key: "aw_dev_fromfile",
        server: "http://file-server:3000",
      });
      const config = resolveConfig();
      expect(config?.api_key).toBe("aw_dev_fromfile");
      expect(config?.server).toBe("http://file-server:3000");
    });

    it("env vars override config file", () => {
      writeConfig({
        api_key: "aw_dev_fromfile",
        server: "http://file-server:3000",
      });
      vi.stubEnv("AW_API_KEY", "aw_dev_fromenv");
      vi.stubEnv("AW_SERVER", "http://env-server:3000");
      const config = resolveConfig();
      expect(config?.api_key).toBe("aw_dev_fromenv");
      expect(config?.server).toBe("http://env-server:3000");
    });

    it("flags override env vars", () => {
      vi.stubEnv("AW_API_KEY", "aw_dev_fromenv");
      const config = resolveConfig({
        apiKey: "aw_dev_fromflag",
        server: "http://flag-server:3000",
      });
      expect(config?.api_key).toBe("aw_dev_fromflag");
      expect(config?.server).toBe("http://flag-server:3000");
    });
  });
});
