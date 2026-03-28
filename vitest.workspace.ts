import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "cli",
      root: "./packages/cli",
      include: ["src/**/*.test.ts"],
    },
  },
]);
