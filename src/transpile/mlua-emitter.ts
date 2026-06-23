import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import type { ScriptClassInfo } from "./script-class";
import { resolveType } from "./type-resolver";

const DUMMY_PARAM = "____MSW_CLASS____";

/**
 * Wraps the method-assignment statements produced by TSTL's class transform
 * inside a dummy function so we can retrieve them by name in the printer.
 */
export function wrapClassStatements(
    node: ts.ClassDeclaration,
    context: tstl.TransformationContext,
): tstl.Statement[] {
    const statements = context.superTransformNode(node) as tstl.Statement[];

    const className = node.name?.text;
    if (!className) return statements;

    // Keep only the method-assignment statements
    const methodStatements = statements.filter(
        (s): s is tstl.AssignmentStatement =>
            tstl.isAssignmentStatement(s) &&
            s.left.length === 1 &&
            s.right.length === 1 &&
            tstl.isFunctionExpression(s.right[0]!),
    );

    return [
        tstl.createExpressionStatement(
            tstl.createFunctionExpression(
                tstl.createBlock(methodStatements),
                [tstl.createIdentifier(DUMMY_PARAM), tstl.createIdentifier(className)],
            ),
        ),
    ];
}

/**
 * Finds method Lua AST bodies from the wrapped function statement,
 * keyed by method name.
 */
function findLuaMethods(statements: tstl.Statement[]): Map<string, tstl.Block> {
    const map = new Map<string, tstl.Block>();
    for (const s of statements) {
        if (!tstl.isAssignmentStatement(s)) continue;
        if (s.left.length !== 1 || s.right.length !== 1) continue;

        const lhs = s.left[0]!;
        if (!tstl.isTableIndexExpression(lhs)) continue;

        const key = lhs.index;
        if (!tstl.isStringLiteral(key)) continue;

        const func = s.right[0]!;
        if (!tstl.isFunctionExpression(func)) continue;

        map.set(key.value, func.body);
    }
    return map;
}

/**
 * Detects the wrapper function emitted by wrapClassStatements and returns
 * its inner method statements, or undefined if this is not a wrapped script file.
 */
export function extractWrappedStatements(
    file: tstl.File,
    className: string,
): tstl.Statement[] | undefined {
    for (const s of file.statements) {
        if (!tstl.isExpressionStatement(s)) continue;
        const fn = s.expression;
        if (!tstl.isFunctionExpression(fn)) continue;
        if (
            fn.params?.length === 2 &&
            fn.params[0]!.text === DUMMY_PARAM &&
            fn.params[1]!.text === className
        ) {
            return fn.body.statements;
        }
    }
    return undefined;
}

/**
 * Produces the full mlua file content for a Logic script.
 * Uses TSTL's LuaPrinter to print method bodies as real Lua.
 */
export function printMluaScript(
    info: ScriptClassInfo,
    file: tstl.File,
    program: ts.Program,
    emitHost: tstl.EmitHost,
    sourceFileName: string,
): string {
    const wrappedStatements = extractWrappedStatements(file, info.className);
    if (wrappedStatements === undefined) return "";

    const luaMethods = findLuaMethods(wrappedStatements);
    const printer = new tstl.LuaPrinter(emitHost, program, sourceFileName);

    const lines: string[] = [];
    lines.push(`@${info.scriptType}`);
    lines.push(`script ${info.className} extends ${info.extendsName ?? info.scriptType}`);
    lines.push("");

    // Emit properties from TypeScript AST
    const sourceFile = program.getSourceFile(sourceFileName)!;
    for (const member of info.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const name = ts.isIdentifier(member.name) ? member.name.text : undefined;
        if (!name) continue;
        const typeStr = resolveType(program, member);
        const init = member.initializer ? member.initializer.getText(sourceFile) : "nil";
        const isReadonly = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;
        const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
        for (const decorator of getDecorators(member)) {
            lines.push(`\t${decorator}`);
        }
        const propPrefix = `${isStatic ? "static " : ""}${isReadonly ? "readonly " : ""}`;
        const propInit = isReadonly ? "" : ` = ${init}`;
        lines.push(`\t${propPrefix}property ${typeStr} ${name}${propInit}`);
        lines.push("");
    }

    // Emit constructor as OnInitialize
    const constructor = info.members.find(ts.isConstructorDeclaration);
    if (constructor) {
        const body = luaMethods.get("____constructor");
        lines.push(`\tmethod void OnInitialize()`);
        if (body) {
            // Drop the leading super() call if the class extends something
            const statements = info.extendsName
                ? body.statements.slice(1)
                : body.statements;
            if (statements.length > 0) {
                // @ts-expect-error printStatementArray is protected in LuaPrinter
                const printed: (string | object)[] = printer.printStatementArray(statements);
                const bodyStr = printed.map((n) => (typeof n === "string" ? n : (n as any).toString())).join("");
                for (const bodyLine of bodyStr.split("\n")) {
                    if (bodyLine.trim()) lines.push(`\t\t${bodyLine.trimStart()}`);
                }
            }
        }
        lines.push(`\tend`);
        lines.push("");
    }

    // Emit methods: signature from TypeScript AST, body from Lua AST via TSTL printer
    for (const member of info.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const name = ts.isIdentifier(member.name) ? member.name.text : undefined;
        if (!name) continue;

        const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
        const returnType = resolveType(program, member);
        const params = member.parameters
            .map((p) => {
                const pName = ts.isIdentifier(p.name) ? p.name.text : "_";
                return `${resolveType(program, p, true)} ${pName}`;
            })
            .join(", ");

        for (const decorator of getDecorators(member)) {
            lines.push(`\t${decorator}`);
        }
        const prefix = isStatic ? "static " : "";
        lines.push(`\t${prefix}method ${returnType} ${name}(${params})`);

        const body = luaMethods.get(name);
        if (body && body.statements.length > 0) {
            // @ts-expect-error printStatementArray is protected in LuaPrinter
            const printed: (string | object)[] = printer.printStatementArray(body.statements);
            const bodyStr = printed.map((n) => (typeof n === "string" ? n : (n as any).toString())).join("");
            for (const bodyLine of bodyStr.split("\n")) {
                if (bodyLine.trim()) lines.push(`\t\t${bodyLine.trimStart()}`);
            }
        }

        lines.push(`\tend`);
        lines.push("");
    }

    lines.push("end");
    return lines.join("\n");
}

function getDecorators(node: ts.HasModifiers): string[] {
    const results: string[] = [];
    for (const modifier of node.modifiers ?? []) {
        if (!ts.isDecorator(modifier)) continue;
        const expr = modifier.expression;
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
            const name = expr.expression.text;
            const args = expr.arguments.map((a) =>
                ts.isStringLiteral(a) ? `"${a.text}"` : a.getText(),
            );
            results.push(`@${name}(${args.join(", ")})`);
        } else if (ts.isIdentifier(expr)) {
            results.push(`@${expr.text}`);
        }
    }
    return results;
}
