import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import type { ScriptClassInfo } from "./script-class.ts";
import { hasImmediateInit, resolveType } from "./type-resolver.ts";

export const DUMMY_PARAM = "____MSW_CLASS____";

const MLUA_ANNOTATION: Record<string, string> = {
    ActionNode: "BTNode",
    DecoratorNode: "BTNode",
};

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
            // biome-ignore lint/style/noNonNullAssertion: length already checked above
            tstl.isFunctionExpression(s.right[0]!),
    );

    return [
        tstl.createExpressionStatement(
            tstl.createFunctionExpression(tstl.createBlock(methodStatements), [
                tstl.createIdentifier(DUMMY_PARAM),
                tstl.createIdentifier(className),
            ]),
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

        // biome-ignore lint/style/noNonNullAssertion: length already checked above
        const lhs = s.left[0]!;
        if (!tstl.isTableIndexExpression(lhs)) continue;

        const key = lhs.index;
        if (!tstl.isStringLiteral(key)) continue;

        // biome-ignore lint/style/noNonNullAssertion: length already checked above
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
            fn.params[0]?.text === DUMMY_PARAM &&
            fn.params[1]?.text === className
        ) {
            return fn.body.statements;
        }
    }
    return undefined;
}

/**
 * Returns true if a statement is a script class wrapper emitted by wrapClassStatements
 * for any of the given class names.
 */
export function isScriptClassWrapper(
    s: tstl.Statement,
    classNames: Set<string>,
): boolean {
    if (!tstl.isExpressionStatement(s)) return false;
    const fn = s.expression;
    if (!tstl.isFunctionExpression(fn)) return false;
    if (fn.params?.length !== 2) return false;
    if (fn.params[0]?.text !== DUMMY_PARAM) return false;
    const second = fn.params[1]?.text;
    return second !== undefined && classNames.has(second);
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
    lines.push(`@${MLUA_ANNOTATION[info.scriptType] ?? info.scriptType}`);
    const extendsClause = info.extendsName
        ? ` extends ${info.extendsName}`
        : "";
    lines.push(`script ${info.className}${extendsClause}`);
    lines.push("");

    // biome-ignore lint/style/noNonNullAssertion: sourceFileName is always a file in the program
    const sourceFile = program.getSourceFile(sourceFileName)!;

    // Collect property names so we can strip their self-assignments from the constructor body
    const propertyNames = new Set(
        info.members
            .filter(ts.isPropertyDeclaration)
            .map((m) => (ts.isIdentifier(m.name) ? m.name.text : undefined))
            .filter((n): n is string => n !== undefined),
    );

    // Get the constructor Lua body upfront so we can mutate it before emitting properties
    const constructorBody = luaMethods.get("____constructor");
    // Statements to use for constructor body: drop super() call, then filter property assignments
    const constructorStatements = constructorBody
        ? (info.extendsName
              ? constructorBody.statements.slice(1)
              : [...constructorBody.statements]
          ).filter((s) => !isSelfPropertyAssignment(s, propertyNames))
        : [];

    // Emit properties from TypeScript AST
    for (const member of info.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const name = ts.isIdentifier(member.name)
            ? member.name.text
            : undefined;
        if (!name) continue;
        const typeStr = resolveType(program, member);
        const isReadonly =
            member.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword,
            ) ?? false;
        const isStatic =
            member.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.StaticKeyword,
            ) ?? false;
        for (const decorator of getDecorators(member)) {
            lines.push(`\t${decorator}`);
        }
        const propPrefix = `${isStatic ? "static " : ""}${isReadonly ? "readonly " : ""}`;
        // Types that need a concrete initializer get one; others get = nil; readonly gets nothing
        let propInit = "";
        if (!isReadonly) {
            if (hasImmediateInit(typeStr) || member.initializer) {
                const val = member.initializer
                    ? member.initializer.getText(sourceFile)
                    : "nil";
                propInit = ` = ${val}`;
            } else {
                propInit = " = nil";
            }
        }
        lines.push(`\t${propPrefix}property ${typeStr} ${name}${propInit}`);
        lines.push("");
    }

    // Emit constructor — name differs by script type
    const constructorMethodName =
        info.scriptType === "Component" ? "OnInitialize" : "__Load";
    const ctorDecl = info.members.find(ts.isConstructorDeclaration);
    if (ctorDecl) {
        lines.push(`\tmethod void ${constructorMethodName}()`);
        if (constructorStatements.length > 0) {
            // @ts-expect-error printStatementArray is protected in LuaPrinter
            const printed: (string | object)[] = printer.printStatementArray(
                constructorStatements,
            );
            const bodyStr = printed
                .map((n) => (typeof n === "string" ? n : String(n)))
                .join("");
            for (const bodyLine of bodyStr.split("\n")) {
                if (bodyLine.trim()) lines.push(`\t\t${bodyLine}`);
            }
        }
        lines.push(`\tend`);
        lines.push("");
    }

    // Emit methods: signature from TypeScript AST, body from Lua AST via TSTL printer
    for (const member of info.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const name = ts.isIdentifier(member.name)
            ? member.name.text
            : undefined;
        if (!name) continue;

        const isStatic =
            member.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.StaticKeyword,
            ) ?? false;
        const returnType = resolveType(program, member);
        const params = member.parameters
            .map((p) => {
                const pName = ts.isIdentifier(p.name) ? p.name.text : "_";
                const typeStr = resolveType(program, p, true);
                if (p.initializer) {
                    return `${typeStr} ${pName} = ${p.initializer.getText(sourceFile)}`;
                }
                if (p.questionToken) {
                    return `${typeStr} ${pName} = nil`;
                }
                return `${typeStr} ${pName}`;
            })
            .join(", ");

        const decorators = getDecorators(member);
        const isHandler = decorators.some((d) => d.startsWith("@EventSender"));
        for (const decorator of decorators) {
            lines.push(`\t${decorator}`);
        }
        const prefix = isStatic ? "static " : "";
        if (isHandler) {
            // handler <EventType> <name>(<EventType> event)
            // The event type comes from the first parameter's type annotation
            const firstParam = member.parameters[0];
            const eventType = firstParam
                ? resolveType(program, firstParam, true)
                : "any";
            const eventParamName =
                firstParam && ts.isIdentifier(firstParam.name)
                    ? firstParam.name.text
                    : "event";
            lines.push(
                `\t${prefix}handler ${name}(${eventType} ${eventParamName})`,
            );
        } else {
            lines.push(`\t${prefix}method ${returnType} ${name}(${params})`);
        }

        if (info.scriptType === "Logic" && name === "OnBeginPlay") {
            lines.push(`\t\t_LuaLib:lualib_bundle_Load()`);
        }

        const body = luaMethods.get(name);
        if (body && body.statements.length > 0) {
            // @ts-expect-error printStatementArray is protected in LuaPrinter
            const printed: (string | object)[] = printer.printStatementArray(
                body.statements,
            );
            const bodyStr = printed
                .map((n) => (typeof n === "string" ? n : String(n)))
                .join("");
            for (const bodyLine of bodyStr.split("\n")) {
                if (bodyLine.trim()) lines.push(`\t\t${bodyLine}`);
            }
        }

        lines.push(`\tend`);
        lines.push("");
    }

    lines.push("end");
    return lines.join("\n");
}

// Returns true if the statement is a `self.<name> = ...` assignment for a known property name
function isSelfPropertyAssignment(
    s: tstl.Statement,
    propertyNames: Set<string>,
): boolean {
    if (!tstl.isAssignmentStatement(s) || s.left.length !== 1) return false;
    // biome-ignore lint/style/noNonNullAssertion: length already checked above
    const lhs = s.left[0]!;
    if (!tstl.isTableIndexExpression(lhs)) return false;
    if (!tstl.isIdentifier(lhs.table) || lhs.table.text !== "self")
        return false;
    if (!tstl.isStringLiteral(lhs.index)) return false;
    return propertyNames.has(lhs.index.value);
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
