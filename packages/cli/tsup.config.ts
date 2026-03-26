import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  clean: true,
  dts: false,
  external: [
    "@agentura/eval-runner",
    "@agentura/types",
    "@agentura/db",
    "@agentura/sdk",
  ],
  banner: { js: "#!/usr/bin/env node" },
});
