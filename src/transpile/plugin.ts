import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { SourceNode } from "source-map";
import type { Plugin } from "typescript-to-lua";
import { collectScriptClass } from "./script-class";
import { wrapClassStatements, printMluaScript } from "./mlua-emitter";
import { printModuleScript, makeModulePrintResult } from "./module-emitter";
import type { ScriptType } from "./msw-files";

export interface MswPlugin {
    plugin: Plugin;
    /** Populated after transpileProject — maps absolute source path to script type. */
    emittedScripts: Map<string, ScriptType>;
}

export function createMswPlugin(): MswPlugin {
    const emittedScripts = new Map<string, ScriptType>();
    const plugin: Plugin = {
        visitors: {
            [ts.SyntaxKind.ClassDeclaration](node: ts.ClassDeclaration, context: tstl.TransformationContext) {
                const { info } = collectScriptClass(node.getSourceFile());
                if (!info || info.className !== node.name?.text) {
                    return context.superTransformNode(node) as tstl.Statement[];
                }
                return wrapClassStatements(node, context);
            },
        },

        printer(program, emitHost, sourceFileName, file) {
            const sourceFile = program.getSourceFile(sourceFileName);
            if (!sourceFile || sourceFile.isDeclarationFile) {
                return new tstl.LuaPrinter(emitHost, program, sourceFileName).print(file);
            }

            const luaPrinter = new tstl.LuaPrinter(emitHost, program, sourceFileName);
            const { info } = collectScriptClass(sourceFile);

            if (!info) {
                // Module file — wrap in @Logic ScriptModule with __Load()
                emittedScripts.set(sourceFileName, "Logic");
                const code = printModuleScript(sourceFileName, file, luaPrinter);
                return makeModulePrintResult(code);
            }

            emittedScripts.set(sourceFileName, info.scriptType as ScriptType);
            const code = printMluaScript(info, file, program, emitHost, sourceFileName);
            return { code, sourceMap: "", sourceMapNode: new SourceNode(null, null, null, code) };
        },
    };

    return { plugin, emittedScripts };
}
