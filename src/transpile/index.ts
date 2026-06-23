import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { transpileProject } from "typescript-to-lua";
import { createMswPlugin } from "./plugin";
import { ensureOutputDirectory, writeCodeblock } from "./msw-files";

export interface BuildOptions {
    workingDirectory: string;
}

export interface BuildResult {
    emitSkipped: boolean;
    outputDirectory: string;
}

export async function build({ workingDirectory }: BuildOptions): Promise<BuildResult> {
    const resolvedWorkingDirectory = path.resolve(workingDirectory);
    const scriptDir = path.join(resolvedWorkingDirectory, "script");
    const outDir = path.join(resolvedWorkingDirectory, "RootDesk", "Transpiled");
    const tsconfigPath = path.join(resolvedWorkingDirectory, "tsconfig.json");

    if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
    }

    const { plugin, emittedScripts } = createMswPlugin();

    const { diagnostics, emitSkipped } = transpileProject(tsconfigPath, {
        luaPlugins: [{ plugin }],
        noHeader: true,
        noEmit: false,
        noImplicitSelf: true,
        experimentalDecorators: true,
        extension: "mlua",
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Classic,
        rootDir: scriptDir,
        outDir,
    });

    const errors = diagnostics.filter(
        (d) =>
            d.category === ts.DiagnosticCategory.Error &&
            // TSTL incorrectly rejects decorator functions under noImplicitSelf
            d.messageText !== "Decorator function cannot have 'this: void'.",
    );
    if (errors.length > 0) {
        const messages = errors.map((d) => {
            const msg =
                typeof d.messageText === "string"
                    ? d.messageText
                    : d.messageText.messageText;
            if (d.file && d.start !== undefined) {
                const { line, character } =
                    d.file.getLineAndCharacterOfPosition(d.start);
                return `${d.file.fileName}(${line + 1},${character + 1}): ${msg}`;
            }
            return msg;
        });
        throw new Error(messages.join("\n"));
    }

    // Write .directory sidecars for each output directory, and .codeblock for each script
    const rootDesk = path.join(resolvedWorkingDirectory, "RootDesk");
    for (const [sourceFile, scriptType] of emittedScripts) {
        const rel = path.relative(scriptDir, sourceFile);
        const mlua = path.join(outDir, rel.replace(/\.ts$/, ".mlua"));
        const mluaDir = path.dirname(mlua);
        const name = path.basename(mlua, ".mlua");

        ensureOutputDirectory(rootDesk, mluaDir);
        writeCodeblock(path.join(mluaDir, `${name}.codeblock`), name, scriptType);
    }

    return { emitSkipped, outputDirectory: outDir };
}
