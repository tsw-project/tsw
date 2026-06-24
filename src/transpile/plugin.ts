import fs from "node:fs";
import path from "node:path";
import { SourceNode } from "source-map";
import * as ts from "typescript";
import type { Plugin } from "typescript-to-lua";
import * as tstl from "typescript-to-lua";
import { isScriptClassWrapper, printMluaScript, wrapClassStatements } from "./mlua-emitter.ts";
import type { ScriptType } from "./msw-files.ts";
import { collectScriptClasses } from "./script-class.ts";

export interface MswPlugin {
    plugin: Plugin;
    /** className -> script type, populated during emit. Clear before each incremental rebuild. */
    emittedScripts: Map<string, ScriptType>;
    /** Source files processed during emit. Clear before each incremental rebuild. */
    processedSourceFiles: Set<string>;
    /** sourceFileName -> non-script-class Lua chunk. Persistent across watch rebuilds. */
    nonScriptClassLuaByFile: Map<string, string>;
}

export function createMswPlugin(outDir: string): MswPlugin {
    fs.mkdirSync(outDir, { recursive: true });

    const emittedScripts = new Map<string, ScriptType>();
    const processedSourceFiles = new Set<string>();
    const nonScriptClassLuaByFile = new Map<string, string>();

    const plugin: Plugin = {
        visitors: {
            [ts.SyntaxKind.ClassDeclaration](
                node: ts.ClassDeclaration,
                context: tstl.TransformationContext,
            ) {
                const { infos } = collectScriptClasses(node.getSourceFile());
                const isScriptClass = infos.some(
                    (info) => info.className === node.name?.text,
                );
                if (!isScriptClass) {
                    return context.superTransformNode(node) as tstl.Statement[];
                }
                return wrapClassStatements(node, context);
            },
        },

        printer(program, emitHost, sourceFileName, file) {
            const sourceFile = program.getSourceFile(sourceFileName);
            if (!sourceFile || sourceFile.isDeclarationFile) {
                return new tstl.LuaPrinter(
                    emitHost,
                    program,
                    sourceFileName,
                ).print(file);
            }

            processedSourceFiles.add(sourceFileName);

            const { infos } = collectScriptClasses(sourceFile);
            const classNames = new Set(infos.map((i) => i.className));

            // Write each script class directly to outDir/<ClassName>.mlua
            for (const info of infos) {
                const code = printMluaScript(
                    info,
                    file,
                    program,
                    emitHost,
                    sourceFileName,
                );
                if (code) {
                    fs.writeFileSync(
                        path.join(outDir, `${info.className}.mlua`),
                        code,
                    );
                    emittedScripts.set(info.className, info.scriptType as ScriptType);
                }
            }

            // Collect non-script-class Lua into LuaLib
            const remaining = file.statements.filter(
                (s) => !isScriptClassWrapper(s, classNames),
            );
            if (remaining.length > 0) {
                const printer = new tstl.LuaPrinter(emitHost, program, sourceFileName);
                // @ts-expect-error printStatementArray is protected in LuaPrinter
                const printed: (string | object)[] = printer.printStatementArray(remaining);
                const raw = printed
                    .map((n) => (typeof n === "string" ? n : String(n)))
                    .join("");

                const lines = raw.split("\n").filter((line) => {
                    const t = line.trim();
                    return (
                        t.length > 0 &&
                        t !== "local ____exports = {}" &&
                        !t.startsWith("____exports.") &&
                        t !== "return ____exports"
                    );
                });

                if (lines.length > 0) {
                    nonScriptClassLuaByFile.set(sourceFileName, lines.join("\n"));
                } else {
                    nonScriptClassLuaByFile.delete(sourceFileName);
                }
            } else {
                nonScriptClassLuaByFile.delete(sourceFileName);
            }

            const empty = "";
            return {
                code: empty,
                sourceMap: "",
                sourceMapNode: new SourceNode(null, null, null, empty),
            };
        },
    };

    return { plugin, emittedScripts, processedSourceFiles, nonScriptClassLuaByFile };
}
