import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { Transpiler, transpileProject } from "typescript-to-lua";
import { generateDeclarations } from "../declarations/index.ts";
import {
    updateGeneratedLogicGlobalsFromProgram,
    updateGeneratedLogicGlobalsFromTsconfig,
} from "./generated-logic-globals.ts";
import {
    TSW_MANAGER_SCRIPT_NAME,
    writeTSWGlobalScript,
} from "./global-wrapper.ts";
import {
    LUALIB_SCRIPT_NAME,
    writeLualibBundleScript,
} from "./lualib-wrapper.ts";
import { ensureOutputDirectory, writeCodeblock } from "./msw-files.ts";
import { createMswPlugin } from "./plugin.ts";

function removeStaleOutputFiles(
    outDir: string,
    expectedFiles: Set<string>,
): void {
    if (!fs.existsSync(outDir)) return;
    for (const entry of fs.readdirSync(outDir)) {
        if (
            (entry.endsWith(".mlua") || entry.endsWith(".codeblock")) &&
            !expectedFiles.has(entry)
        ) {
            fs.unlinkSync(path.join(outDir, entry));
        }
    }
}

function expectedOutputFiles(
    emittedScripts: Map<string, unknown>,
): Set<string> {
    const files = new Set<string>();
    files.add(`${LUALIB_SCRIPT_NAME}.mlua`);
    files.add(`${LUALIB_SCRIPT_NAME}.codeblock`);
    files.add(`${TSW_MANAGER_SCRIPT_NAME}.mlua`);
    files.add(`${TSW_MANAGER_SCRIPT_NAME}.codeblock`);
    for (const className of emittedScripts.keys()) {
        files.add(`${className}.mlua`);
        files.add(`${className}.codeblock`);
    }
    return files;
}

export interface BuildOptions {
    workingDirectory: string;
}

export interface BuildResult {
    emitSkipped: boolean;
    outputDirectory: string;
}

export interface WatchOptions {
    workingDirectory: string;
}

export async function build({
    workingDirectory,
}: BuildOptions): Promise<BuildResult> {
    await generateDeclarations({ workingDirectory });
    const resolvedWorkingDirectory = path.resolve(workingDirectory);
    const scriptDir = path.join(resolvedWorkingDirectory, "Script");
    const outDir = path.join(
        resolvedWorkingDirectory,
        "RootDesk",
        "MyDesk",
        "Transpiled",
    );
    const tsconfigPath = path.join(resolvedWorkingDirectory, "tsconfig.json");

    if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
    }

    updateGeneratedLogicGlobalsFromTsconfig(scriptDir, tsconfigPath);

    const { plugin, emittedScripts, processedSourceFiles, topLevelLuaByFile } =
        createMswPlugin(outDir);

    const { diagnostics, emitSkipped } = transpileProject(tsconfigPath, {
        luaPlugins: [{ plugin }],
        noHeader: true,
        noEmit: false,
        noImplicitSelf: true,
        experimentalDecorators: true,
        extension: "mlua",
        module: ts.ModuleKind.CommonJS,
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

    // Delete the empty per-source-file stubs TSTL wrote (we handled output ourselves)
    for (const sourceFile of processedSourceFiles) {
        const rel = path.relative(scriptDir, sourceFile);
        const stubPath = path.join(outDir, rel.replace(/\.ts$/, ".mlua"));
        if (fs.existsSync(stubPath)) {
            fs.unlinkSync(stubPath);
        }
    }

    writeLualibBundleScript(outDir);
    writeTSWGlobalScript(outDir, topLevelLuaByFile.values());

    const rootDesk = path.join(resolvedWorkingDirectory, "RootDesk");
    ensureOutputDirectory(rootDesk, outDir);
    for (const [className, scriptType] of emittedScripts) {
        writeCodeblock(
            path.join(outDir, `${className}.codeblock`),
            className,
            scriptType,
        );
    }

    removeStaleOutputFiles(outDir, expectedOutputFiles(emittedScripts));

    return { emitSkipped, outputDirectory: outDir };
}

export async function watch({ workingDirectory }: WatchOptions): Promise<void> {
    await generateDeclarations({ workingDirectory });
    const resolvedWorkingDirectory = path.resolve(workingDirectory);
    const scriptDir = path.join(resolvedWorkingDirectory, "Script");
    const outDir = path.join(
        resolvedWorkingDirectory,
        "RootDesk",
        "MyDesk",
        "Transpiled",
    );
    const tsconfigPath = path.join(resolvedWorkingDirectory, "tsconfig.json");

    if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
    }

    updateGeneratedLogicGlobalsFromTsconfig(scriptDir, tsconfigPath);

    const { plugin, emittedScripts, processedSourceFiles, topLevelLuaByFile } =
        createMswPlugin(outDir);
    const transpiler = new Transpiler();

    // Cast needed: TSTL extends ts.CompilerOptions with extra fields unknown to tsc's types.
    const tstlOptions = {
        luaPlugins: [{ plugin }],
        noHeader: true,
        noEmit: false,
        noImplicitSelf: true,
        experimentalDecorators: true,
        extension: "mlua",
        module: ts.ModuleKind.CommonJS,
        rootDir: scriptDir,
        outDir,
    } as unknown as ts.CompilerOptions;

    const host = ts.createWatchCompilerHost(
        tsconfigPath,
        tstlOptions,
        ts.sys,
        ts.createSemanticDiagnosticsBuilderProgram,
    );

    host.afterProgramCreate = (builderProgram) => {
        try {
            const program = builderProgram.getProgram();
            updateGeneratedLogicGlobalsFromProgram(scriptDir, program);

            emittedScripts.clear();
            processedSourceFiles.clear();

            const { diagnostics } = transpiler.emit({ program });

            const errors = [
                ...ts
                    .getPreEmitDiagnostics(program)
                    .filter((d) => d.category === ts.DiagnosticCategory.Error),
                ...diagnostics.filter(
                    (d) =>
                        d.category === ts.DiagnosticCategory.Error &&
                        d.messageText !==
                            "Decorator function cannot have 'this: void'.",
                ),
            ];

            if (errors.length > 0) {
                const formatted = ts.formatDiagnosticsWithColorAndContext(
                    errors,
                    {
                        getCurrentDirectory: () => resolvedWorkingDirectory,
                        getCanonicalFileName: (f) => f,
                        getNewLine: () => "\n",
                    },
                );
                process.stderr.write(formatted);
                return;
            }

            // Delete the empty per-source-file stubs TSTL wrote
            for (const sourceFile of processedSourceFiles) {
                const rel = path.relative(scriptDir, sourceFile);
                const stubPath = path.join(
                    outDir,
                    rel.replace(/\.ts$/, ".mlua"),
                );
                if (fs.existsSync(stubPath)) {
                    fs.unlinkSync(stubPath);
                }
            }

            writeLualibBundleScript(outDir);
            writeTSWGlobalScript(outDir, topLevelLuaByFile.values());

            const rootDesk = path.join(resolvedWorkingDirectory, "RootDesk");
            ensureOutputDirectory(rootDesk, outDir);
            for (const [className, scriptType] of emittedScripts) {
                writeCodeblock(
                    path.join(outDir, `${className}.codeblock`),
                    className,
                    scriptType,
                );
            }

            removeStaleOutputFiles(outDir, expectedOutputFiles(emittedScripts));

            console.log(
                `[${new Date().toLocaleTimeString()}] Build complete. Watching for changes...`,
            );
        } catch (err) {
            console.error(
                "[tsw] Unexpected error during build:",
                err instanceof Error ? err.message : err,
            );
        }
    };

    ts.createWatchProgram(host);
}
