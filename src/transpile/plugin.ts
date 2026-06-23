import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import { SourceNode } from "source-map";
import type { Plugin } from "typescript-to-lua";
import { collectScriptClass } from "./script-class";
import { wrapClassStatements, printMluaScript } from "./mlua-emitter";

export function createMswPlugin(): Plugin {
    return {
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

            const { info } = collectScriptClass(sourceFile);
            if (!info) {
                return new tstl.LuaPrinter(emitHost, program, sourceFileName).print(file);
            }

            const code = printMluaScript(info, file, program, emitHost, sourceFileName);
            return { code, sourceMap: "", sourceMapNode: new SourceNode(null, null, null, code) };
        },
    };
}
