import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  clean: true,
  dts: false,
  noExternal: ["@agentura/eval-runner", "@agentura/types"],
  banner: { js: "#!/usr/bin/env node" },
});
