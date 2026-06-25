import fs from "node:fs";
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
import {
    collectScriptClasses,
    findScriptTypeDecorator,
} from "./script-class.ts";

export interface MswPlugin {
    plugin: Plugin;
    /** className -> script type, populated during emit. Clear before each incremental rebuild. */
    emittedScripts: Map<string, ScriptType>;
    /** className -> generated mlua content, populated during emit. Clear before each incremental rebuild. */
    emittedScriptCode: Map<string, string>;
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

function collectScriptClassNames(program: ts.Program): Set<string> {
    const classNames = new Set<string>();
    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;

        const { infos } = collectScriptClasses(sourceFile);
        for (const info of infos) {
            classNames.add(info.className);
        }
    }
    return classNames;
}

function isNativeTsFile(fileName: string): boolean {
    const normalized = fileName.replace(/\\/g, "/");
    return normalized.includes("/NativeTS/");
}

function collectAllMswTypeNames(program: ts.Program): Set<string> {
    const typeNames = new Set<string>();
    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) {
            if (!isNativeTsFile(sourceFile.fileName)) continue;
            for (const statement of sourceFile.statements) {
                if (ts.isClassDeclaration(statement) && statement.name) {
                    typeNames.add(statement.name.text);
                }
                if (ts.isEnumDeclaration(statement) && statement.name) {
                    typeNames.add(statement.name.text);
                }
            }
            continue;
        }

        const { infos } = collectScriptClasses(sourceFile);
        for (const info of infos) {
            typeNames.add(info.className);
        }
    }
    return typeNames;
}

function getNewExpressionClassName(
    node: ts.NewExpression,
    context: tstl.TransformationContext,
): string | undefined {
    const type = context.checker.getTypeAtLocation(node.expression);
    const symbol = type.aliasSymbol ?? type.symbol;
    if (symbol?.name !== undefined && symbol.name !== "__type") {
        return symbol.name;
    }

    const expression = ts.skipOuterExpressions(node.expression);
    return ts.isIdentifier(expression) ? expression.text : undefined;
}

export function createMswPlugin(outDir: string): MswPlugin {
    fs.mkdirSync(outDir, { recursive: true });

    const emittedScripts = new Map<string, ScriptType>();
    const emittedScriptCode = new Map<string, string>();
    const topLevelLuaByFile = new Map<string, TopLevelLuaChunk>();
    const scriptClassNamesByProgram = new WeakMap<ts.Program, Set<string>>();
    const mswTypeNamesByProgram = new WeakMap<ts.Program, Set<string>>();

    const plugin: Plugin = {
        visitors: {
            [ts.SyntaxKind.NewExpression](
                node: ts.NewExpression,
                context: tstl.TransformationContext,
            ) {
                let scriptClassNames = scriptClassNamesByProgram.get(
                    context.program,
                );
                if (scriptClassNames === undefined) {
                    scriptClassNames = collectScriptClassNames(context.program);
                    scriptClassNamesByProgram.set(
                        context.program,
                        scriptClassNames,
                    );
                }

                const className = getNewExpressionClassName(node, context);
                if (
                    className === undefined ||
                    !scriptClassNames.has(className)
                ) {
                    return context.superTransformExpression(node);
                }

                return tstl.createCallExpression(
                    context.transformExpression(node.expression),
                    (node.arguments ?? []).map((arg) =>
                        context.transformExpression(arg),
                    ),
                    node,
                );
            },

            [ts.SyntaxKind.ClassDeclaration](
                node: ts.ClassDeclaration,
                context: tstl.TransformationContext,
            ) {
                if (!findScriptTypeDecorator(node)) {
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

            const { infos } = collectScriptClasses(sourceFile);
            const classNames = new Set(infos.map((i) => i.className));

            let knownMswTypes = mswTypeNamesByProgram.get(program);
            if (knownMswTypes === undefined) {
                knownMswTypes = collectAllMswTypeNames(program);
                mswTypeNamesByProgram.set(program, knownMswTypes);
            }

            // Write each script class directly to outDir/<ClassName>.mlua
            for (const info of infos) {
                const code = printMluaScript(
                    info,
                    file,
                    program,
                    emitHost,
                    sourceFileName,
                    knownMswTypes,
                );
                if (code) {
                    emittedScriptCode.set(info.className, code);
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

    return {
        plugin,
        emittedScripts,
        emittedScriptCode,
        topLevelLuaByFile,
    };
}
