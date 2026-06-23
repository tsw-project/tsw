import path from "node:path";
import * as tstl from "typescript-to-lua";

/**
 * Returns the module name (file basename without extension) from a TSTL require path.
 * TSTL emits paths like "sub/dir/FileName" — we want "FileName".
 */
export function moduleNameFromRequirePath(requirePath: string): string {
    return path.basename(requirePath);
}

/**
 * Rewrites `local X = require("path")` statements to `local X = _BaseName:__Load()`.
 * Returns a new array of statements with requires replaced.
 */
export function rewriteRequires(statements: readonly tstl.Statement[]): tstl.Statement[] {
    return statements.map((s) => {
        const requirePath = findRequirePath(s);
        if (requirePath === undefined) return s;

        const moduleName = moduleNameFromRequirePath(requirePath);
        const decl = s as tstl.VariableDeclarationStatement;

        // Replace right-hand side: _ModuleName:__Load()
        const loadCall = tstl.createMethodCallExpression(
            tstl.createIdentifier(`_${moduleName}`),
            tstl.createIdentifier("__Load"),
            [],
        );

        return tstl.createVariableDeclarationStatement(
            decl.left,
            [loadCall],
        );
    });
}

/** Returns the required path string if the statement is `local X = require("path")`, else undefined. */
export function findRequirePath(statement: tstl.Statement): string | undefined {
    if (!tstl.isVariableDeclarationStatement(statement)) return undefined;
    if (statement.right === undefined || statement.right.length !== 1) return undefined;

    const rhs = statement.right[0]!;
    if (!tstl.isCallExpression(rhs)) return undefined;

    const callee = rhs.expression;
    if (!tstl.isIdentifier(callee) || callee.text !== "require") return undefined;

    if (!rhs.params || rhs.params.length !== 1) return undefined;
    const arg = rhs.params[0]!;
    if (!tstl.isStringLiteral(arg)) return undefined;

    return arg.value;
}

/** Returns true if any statement in the list is a require() call. */
export function hasRequires(statements: readonly tstl.Statement[]): boolean {
    return statements.some((s) => findRequirePath(s) !== undefined);
}
