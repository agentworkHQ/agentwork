import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/aw.ts"],
  format: "esm",
  target: "node22",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
