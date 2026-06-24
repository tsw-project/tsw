import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    platform: "node",
    unbundle: true,
    banner: {
        js: "#!/usr/bin/env node",
    },
});
