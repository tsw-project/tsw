import fs from "node:fs";
import path from "node:path";
import { SourceNode } from "source-map";
import * as ts from "typescript";
import type { Plugin } from "typescript-to-lua";
import * as tstl from "typescript-to-lua";
import type { TopLevelLuaChunk } from "./global-wrapper.ts";
import {
    isScriptClassWrapper,
    printMluaScript,
    wrapClassStatements,
} from "./mlua-emitter.ts";
import type { ScriptType } from "./msw-files.ts";
import { collectScriptClasses } from "./script-class.ts";

export interface MswPlugin {
    plugin: Plugin;
    /** className -> script type, populated during emit. Clear before each incremental rebuild. */
    emittedScripts: Map<string, ScriptType>;
    /** Source files processed during emit. Clear before each incremental rebuild. */
    processedSourceFiles: Set<string>;
    /** sourceFileName -> non-script-class Lua statements. Persistent across watch rebuilds. */
    topLevelLuaByFile: Map<string, TopLevelLuaChunk>;
}

function isExportsIdentifier(expression: tstl.Expression): boolean {
    return tstl.isIdentifier(expression) && expression.text === "____exports";
}

function isExportsTableAssignmentTarget(expression: tstl.Expression): boolean {
    return (
        tstl.isTableIndexExpression(expression) &&
        isExportsIdentifier(expression.table)
    );
}

function isCommonJsBoilerplate(statement: tstl.Statement): boolean {
    if (tstl.isVariableDeclarationStatement(statement)) {
        const right = statement.right?.[0];
        return (
            statement.left.length === 1 &&
            statement.right?.length === 1 &&
            statement.left[0]?.text === "____exports" &&
            right !== undefined &&
            tstl.isTableExpression(right)
        );
    }
    if (tstl.isAssignmentStatement(statement)) {
        return statement.left.every(isExportsTableAssignmentTarget);
    }
    if (tstl.isReturnStatement(statement)) {
        const expression = statement.expressions[0];
        return (
            statement.expressions.length === 1 &&
            expression !== undefined &&
            isExportsIdentifier(expression)
        );
    }
    return false;
}

export function createMswPlugin(outDir: string): MswPlugin {
    fs.mkdirSync(outDir, { recursive: true });

    const emittedScripts = new Map<string, ScriptType>();
    const processedSourceFiles = new Set<string>();
    const topLevelLuaByFile = new Map<string, TopLevelLuaChunk>();

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
                    emittedScripts.set(
                        info.className,
                        info.scriptType as ScriptType,
                    );
                }
            }

            // Collect non-script-class Lua for the generated TSWGlobal.
            const remaining = file.statements.filter(
                (s) =>
                    !isScriptClassWrapper(s, classNames) &&
                    !isCommonJsBoilerplate(s),
            );
            if (remaining.length > 0) {
                const printer = new tstl.LuaPrinter(
                    emitHost,
                    program,
                    sourceFileName,
                );
                const printStatementArray = (
                    printer as unknown as {
                        printStatementArray(
                            statements: tstl.Statement[],
                        ): (string | object)[];
                    }
                ).printStatementArray.bind(printer);
                const statements = remaining
                    .map((statement) => {
                        const printed = printStatementArray([statement]);
                        const lua = printed
                            .map((n) => (typeof n === "string" ? n : String(n)))
                            .join("");
                        return { statement, lua };
                    })
                    .filter(({ lua }) => lua.trim().length > 0);

                if (statements.length > 0) {
                    topLevelLuaByFile.set(sourceFileName, { statements });
                } else {
                    topLevelLuaByFile.delete(sourceFileName);
                }
            } else {
                topLevelLuaByFile.delete(sourceFileName);
            }

            const empty = "";
            return {
                code: empty,
                sourceMap: "",
                sourceMapNode: new SourceNode(null, null, null, empty),
            };
        },
    };

    return { plugin, emittedScripts, processedSourceFiles, topLevelLuaByFile };
}
