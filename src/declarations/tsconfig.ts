import { access, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTsConfig(workingDirectory: string) {
    const tsconfigPath = path.join(workingDirectory, "tsconfig.json");
    try {
        await access(tsconfigPath);
        return;
    } catch {
        // file does not exist, proceed to write
    }

    const tsconfig = {
        compilerOptions: {
            lib: ["ESNext"],
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
        },
        include: ["Environment/NativeTS/index.d.ts", "Script/**/*.ts"],
        exclude: ["node_modules"],
    };

    await writeFile(
        tsconfigPath,
        `${JSON.stringify(tsconfig, null, 4)}\n`,
        "utf8",
    );
}
