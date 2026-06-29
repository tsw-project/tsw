import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { Transpiler, transpileProject } from "typescript-to-lua";
import { generateDeclarations } from "../declarations/index.ts";
import { loadTswConfig, type LoadedTswConfig } from "./config.ts";
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
import {
    ensureOutputDirectory,
    type ScriptType,
    writeCodeblock,
} from "./msw-files.ts";
import { createMswPlugin } from "./plugin.ts";

const MSW_CLASS_DIR_NAME = "Class";

function removeStaleOutputFiles(
    outDir: string,
    expectedFiles: Set<string>,
): void {
    if (!fs.existsSync(outDir)) return;

    function removeStaleFiles(dir: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                removeStaleFiles(entryPath);
                continue;
            }

            if (!entry.isFile()) continue;
            if (
                !entry.name.endsWith(".mlua") &&
                !entry.name.endsWith(".codeblock")
            ) {
                continue;
            }

            const rel = path.relative(outDir, entryPath);
            if (!expectedFiles.has(rel)) {
                fs.unlinkSync(entryPath);
            }
        }
    }

    removeStaleFiles(outDir);
}

function expectedOutputFiles(
    emittedScripts: Map<string, ScriptType>,
): Set<string> {
    const files = new Set<string>();
    files.add(`${LUALIB_SCRIPT_NAME}.mlua`);
    files.add(`${LUALIB_SCRIPT_NAME}.codeblock`);
    files.add(`${TSW_MANAGER_SCRIPT_NAME}.mlua`);
    files.add(`${TSW_MANAGER_SCRIPT_NAME}.codeblock`);
    for (const [className, scriptType] of emittedScripts) {
        files.add(getMswClassOutputRelPath(className, scriptType, "mlua"));
        files.add(getMswClassOutputRelPath(className, scriptType, "codeblock"));
    }
    return files;
}

function getMswClassOutputDir(outDir: string, scriptType: ScriptType): string {
    return path.join(outDir, MSW_CLASS_DIR_NAME, scriptType);
}

function getMswClassOutputRelPath(
    className: string,
    scriptType: ScriptType,
    extension: "mlua" | "codeblock",
): string {
    return path.join(
        MSW_CLASS_DIR_NAME,
        scriptType,
        `${className}.${extension}`,
    );
}

function getMswClassOutputPath(
    outDir: string,
    className: string,
    scriptType: ScriptType,
    extension: "mlua" | "codeblock",
): string {
    return path.join(
        outDir,
        getMswClassOutputRelPath(className, scriptType, extension),
    );
}

function writeEmittedScriptCode(
    rootDesk: string,
    outDir: string,
    emittedScriptCode: Map<string, string>,
    emittedScripts: Map<string, ScriptType>,
): void {
    for (const [className, code] of emittedScriptCode) {
        const scriptType = emittedScripts.get(className);
        if (scriptType === undefined) {
            throw new Error(
                `Missing script type for emitted class ${className}`,
            );
        }

        const classDir = getMswClassOutputDir(outDir, scriptType);
        ensureOutputDirectory(rootDesk, classDir);
        fs.writeFileSync(
            getMswClassOutputPath(outDir, className, scriptType, "mlua"),
            code,
        );
    }
}

function applyRegexToOutput(
    outDir: string,
    config: LoadedTswConfig,
    expectedFiles: Set<string>,
): void {
    for (const rel of expectedFiles) {
        if (!rel.endsWith(".mlua")) continue;

        const filePath = path.join(outDir, rel);
        if (!fs.existsSync(filePath)) continue;

        const code = fs.readFileSync(filePath, "utf8");
        const transformed = config.applyMluaRegex(code);
        if (transformed !== code) {
            fs.writeFileSync(filePath, transformed);
        }
    }
}

function createTstlWriteFile(
    outDir: string,
    writeFile: ts.WriteFileCallback = ts.sys.writeFile,
): ts.WriteFileCallback {
    return (fileName, data, writeByteOrderMark, onError, sourceFiles) => {
        const rel = path.relative(outDir, fileName);
        const isTswManagedOutput =
            rel.length > 0 &&
            !rel.startsWith("..") &&
            !path.isAbsolute(rel) &&
            (fileName.endsWith(".mlua") || fileName.endsWith(".mlua.map"));

        if (isTswManagedOutput) return;
        writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
    };
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
    const config = await loadTswConfig(resolvedWorkingDirectory);

    if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
    }

    updateGeneratedLogicGlobalsFromTsconfig(scriptDir, tsconfigPath);

    const { plugin, emittedScripts, emittedScriptCode, topLevelLuaByFile } =
        createMswPlugin(outDir);

    const { diagnostics, emitSkipped } = transpileProject(
        tsconfigPath,
        {
            luaPlugins: [{ plugin }],
            noHeader: true,
            noEmit: false,
            noImplicitSelf: true,
            experimentalDecorators: true,
            extension: "mlua",
            module: ts.ModuleKind.CommonJS,
            rootDir: scriptDir,
            outDir,
        },
        createTstlWriteFile(outDir),
    );

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

    const rootDesk = path.join(resolvedWorkingDirectory, "RootDesk");
    ensureOutputDirectory(rootDesk, outDir);

    writeEmittedScriptCode(
        rootDesk,
        outDir,
        emittedScriptCode,
        emittedScripts,
    );
    writeLualibBundleScript(outDir);
    writeTSWGlobalScript(outDir, topLevelLuaByFile.values());

    for (const [className, scriptType] of emittedScripts) {
        const classDir = getMswClassOutputDir(outDir, scriptType);
        ensureOutputDirectory(rootDesk, classDir);
        writeCodeblock(
            getMswClassOutputPath(outDir, className, scriptType, "codeblock"),
            className,
            scriptType,
        );
    }

    const expectedFiles = expectedOutputFiles(emittedScripts);
    applyRegexToOutput(outDir, config, expectedFiles);
    removeStaleOutputFiles(outDir, expectedFiles);

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

    const { plugin, emittedScripts, emittedScriptCode, topLevelLuaByFile } =
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

    host.afterProgramCreate = async (builderProgram) => {
        try {
            const config = await loadTswConfig(resolvedWorkingDirectory);
            const program = builderProgram.getProgram();
            updateGeneratedLogicGlobalsFromProgram(scriptDir, program);

            emittedScripts.clear();
            emittedScriptCode.clear();

            const { diagnostics } = transpiler.emit({
                program,
                writeFile: createTstlWriteFile(outDir),
            });

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

            const rootDesk = path.join(resolvedWorkingDirectory, "RootDesk");
            ensureOutputDirectory(rootDesk, outDir);

            writeEmittedScriptCode(
                rootDesk,
                outDir,
                emittedScriptCode,
                emittedScripts,
            );
            writeLualibBundleScript(outDir);
            writeTSWGlobalScript(outDir, topLevelLuaByFile.values());

            for (const [className, scriptType] of emittedScripts) {
                const classDir = getMswClassOutputDir(outDir, scriptType);
                ensureOutputDirectory(rootDesk, classDir);
                writeCodeblock(
                    getMswClassOutputPath(
                        outDir,
                        className,
                        scriptType,
                        "codeblock",
                    ),
                    className,
                    scriptType,
                );
            }

            const expectedFiles = expectedOutputFiles(emittedScripts);
            applyRegexToOutput(outDir, config, expectedFiles);
            removeStaleOutputFiles(outDir, expectedFiles);

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
