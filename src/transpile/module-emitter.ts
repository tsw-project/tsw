import path from "node:path";
import * as tstl from "typescript-to-lua";
import { SourceNode } from "source-map";
import { rewriteRequires } from "./require-rewriter";

/**
 * Emits a non-script-class TypeScript file as a module wrapper:
 *
 *   @Logic
 *   script FileName extends Logic
 *       property any _Module = nil
 *       method any __Load()
 *           if self._Module ~= nil then
 *               return self._Module
 *           end
 *           self._Module = {}
 *           <all TSTL statements, requires rewritten to _Name:__Load()>
 *           return self._Module
 *       end
 *   end
 */
export function printModuleScript(
    sourceFileName: string,
    file: tstl.File,
    printer: tstl.LuaPrinter,
): string {
    const name = path.basename(sourceFileName, ".ts");

    // Rewrite require() calls to _Name:__Load()
    const statements = rewriteRequires(file.statements);

    // @ts-expect-error printStatementArray is protected in LuaPrinter
    const printed: (string | object)[] = printer.printStatementArray(statements);
    const bodyStr = printed
        .map((n) => (typeof n === "string" ? n : (n as any).toString()))
        .join("");

    const lines: string[] = [];
    lines.push(`@Logic`);
    lines.push(`script ${name} extends Logic`);
    lines.push(``);
    lines.push(`\tproperty any _Module = nil`);
    lines.push(``);
    lines.push(`\tmethod any __Load()`);
    lines.push(`\t\tif self._Module ~= nil then`);
    lines.push(`\t\t\treturn self._Module`);
    lines.push(`\t\tend`);
    // Split body into pre-return statements and the final return (TSTL emits `return ____exports`)
    const bodyLines = bodyStr.split("\n").filter((l) => l.trim());
    const returnIdx = bodyLines.findLastIndex((l) => l.trimStart().startsWith("return "));
    const preReturn = returnIdx >= 0 ? bodyLines.slice(0, returnIdx) : bodyLines;
    const returnLine = returnIdx >= 0 ? bodyLines[returnIdx]!.trimStart() : undefined;

    // Capture the exports table into _Module
    if (returnLine) {
        // e.g. `return ____exports` → `self._Module = ____exports`
        const exportExpr = returnLine.replace(/^return\s+/, "").trim();
        for (const line of preReturn) {
            lines.push(`\t\t${line.trimStart()}`);
        }
        lines.push(`\t\tself._Module = ${exportExpr}`);
    } else {
        for (const line of preReturn) {
            lines.push(`\t\t${line.trimStart()}`);
        }
        lines.push(`\t\tself._Module = {}`);
    }

    lines.push(`\t\treturn self._Module`);
    lines.push(`\tend`);
    lines.push(``);
    lines.push(`end`);

    return lines.join("\n");
}

export function makeModulePrintResult(code: string): tstl.PrintResult {
    return { code, sourceMap: "", sourceMapNode: new SourceNode(null, null, null, code) };
}
