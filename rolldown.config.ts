import { defineConfig } from "rolldown";

const external = (id: string): boolean =>
  !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0");

export default defineConfig([
  {
    input: "src/cli.ts",
    platform: "node",
    external,
    output: {
      file: "dist/cli.js",
      format: "esm",
      banner: "#!/usr/bin/env node"
    }
  },
  {
    input: "src/index.ts",
    platform: "node",
    external,
    output: {
      file: "dist/index.js",
      format: "esm"
    }
  }
]);
