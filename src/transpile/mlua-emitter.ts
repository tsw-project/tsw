import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import {
    TSW_MANAGER_LOAD_METHOD,
    TSW_MANAGER_SCRIPT_NAME,
} from "./global-wrapper.ts";
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
        if (!func.body) continue;

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
            return fn.body?.statements ?? [];
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
    knownMswTypes?: Set<string>,
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
    const originalConstructorStatements = constructorBody
        ? info.extendsName
            ? getBlockStatements(constructorBody).slice(1)
            : [...getBlockStatements(constructorBody)]
        : [];
    const propertyInitializers = collectSelfPropertyInitializers(
        printer,
        originalConstructorStatements,
        propertyNames,
        info.className,
    );
    // Statements to use for constructor body: drop super() call, then filter property assignments
    const constructorStatements = originalConstructorStatements.filter(
        (s) => !isSelfPropertyAssignment(s, propertyNames),
    );

    // Emit properties from TypeScript AST
    for (const member of info.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const name = ts.isIdentifier(member.name)
            ? member.name.text
            : undefined;
        if (!name) continue;
        const typeStr = resolveType(program, member, false, knownMswTypes);
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
        const baseTypeName = typeStr.includes("<")
            ? typeStr.slice(0, typeStr.indexOf("<"))
            : typeStr;
        let propInit = "";
        if (!isReadonly && baseTypeName !== "SyncTable") {
            if (hasImmediateInit(typeStr) || member.initializer) {
                const printedInitializer = propertyInitializers.get(name);
                const val =
                    printedInitializer ??
                    (member.initializer &&
                    !isUndefinedLiteral(member.initializer)
                        ? member.initializer.getText(sourceFile)
                        : "nil");
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
            const bodyStr = printStatements(
                printer,
                constructorStatements,
                `${info.className}.${constructorMethodName}`,
            );
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
        const returnType = resolveType(program, member, false, knownMswTypes);
        const params = member.parameters
            .map((p) => {
                const pName = ts.isIdentifier(p.name) ? p.name.text : "_";
                const typeStr = resolveType(program, p, true, knownMswTypes);
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
                ? resolveType(program, firstParam, true, knownMswTypes)
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
            lines.push(
                `\t\t_${TSW_MANAGER_SCRIPT_NAME}:${TSW_MANAGER_LOAD_METHOD}()`,
            );
        }

        const body = luaMethods.get(name);
        const bodyStatements = body ? getBlockStatements(body) : [];
        if (bodyStatements.length > 0) {
            const bodyStr = printStatements(
                printer,
                bodyStatements,
                `${info.className}.${name}`,
            );
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

function getBlockStatements(block: tstl.Block): tstl.Statement[] {
    return block.statements ?? [];
}

function printStatements(
    printer: tstl.LuaPrinter,
    statements: tstl.Statement[],
    context: string,
): string {
    try {
        // @ts-expect-error printStatementArray is protected in LuaPrinter
        const printed: (string | object)[] =
            printer.printStatementArray(statements);
        return printed
            .map((n) => (typeof n === "string" ? n : String(n)))
            .join("");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to print ${context}: ${message}`);
    }
}

function collectSelfPropertyInitializers(
    printer: tstl.LuaPrinter,
    statements: tstl.Statement[],
    propertyNames: Set<string>,
    context: string,
): Map<string, string> {
    const initializers = new Map<string, string>();
    for (const statement of statements) {
        const name = getSelfPropertyAssignmentName(statement, propertyNames);
        if (name === undefined) continue;

        const printed = printStatements(
            printer,
            [statement],
            `${context}.${name} initializer`,
        ).trim();
        const prefix = `self.${name} = `;
        if (printed.startsWith(prefix)) {
            initializers.set(name, printed.slice(prefix.length).trim());
        }
    }
    return initializers;
}

// Returns true if the statement is a `self.<name> = ...` assignment for a known property name
function isSelfPropertyAssignment(
    s: tstl.Statement,
    propertyNames: Set<string>,
): boolean {
    return getSelfPropertyAssignmentName(s, propertyNames) !== undefined;
}

function getSelfPropertyAssignmentName(
    s: tstl.Statement,
    propertyNames: Set<string>,
): string | undefined {
    if (!tstl.isAssignmentStatement(s) || s.left.length !== 1) return undefined;
    // biome-ignore lint/style/noNonNullAssertion: length already checked above
    const lhs = s.left[0]!;
    if (!tstl.isTableIndexExpression(lhs)) return undefined;
    if (!tstl.isIdentifier(lhs.table) || lhs.table.text !== "self")
        return undefined;
    if (!tstl.isStringLiteral(lhs.index)) return undefined;
    return propertyNames.has(lhs.index.value) ? lhs.index.value : undefined;
}

function isUndefinedLiteral(node: ts.Expression): boolean {
    if (ts.isNonNullExpression(node))
        return isUndefinedLiteral(node.expression);
    return ts.isIdentifier(node) && node.text === "undefined";
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
