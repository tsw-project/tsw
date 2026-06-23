import * as ts from "typescript";

const SCRIPT_TYPE_DECORATORS = new Set(["LogicClass"]);

const DECORATOR_TO_SCRIPT_TYPE: Record<string, string> = {
    LogicClass: "Logic",
};

export interface ScriptClassInfo {
    scriptType: string;
    className: string;
    extendsName: string | undefined;
    members: ts.ClassElement[];
}

export function findScriptTypeDecorator(node: ts.ClassDeclaration): string | undefined {
    for (const modifier of node.modifiers ?? []) {
        if (!ts.isDecorator(modifier)) continue;
        const expr = modifier.expression;
        const name = ts.isIdentifier(expr)
            ? expr.text
            : ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)
              ? expr.expression.text
              : undefined;
        if (name && SCRIPT_TYPE_DECORATORS.has(name)) return name;
    }
    return undefined;
}

export function collectScriptClass(sourceFile: ts.SourceFile): {
    diagnostics: ts.Diagnostic[];
    info: ScriptClassInfo | undefined;
} {
    const diagnostics: ts.Diagnostic[] = [];
    const found: ScriptClassInfo[] = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) continue;
        const decoratorName = findScriptTypeDecorator(statement);
        if (!decoratorName) continue;

        const name = statement.name?.text;
        if (!name) {
            diagnostics.push(makeDiagnostic(sourceFile, statement, "Script type class must have a name."));
            continue;
        }

        const extendsClause = statement.heritageClauses?.find(
            (c) => c.token === ts.SyntaxKind.ExtendsKeyword,
        );
        const extendsName =
            extendsClause?.types[0]?.expression && ts.isIdentifier(extendsClause.types[0].expression)
                ? extendsClause.types[0].expression.text
                : undefined;

        found.push({
            scriptType: DECORATOR_TO_SCRIPT_TYPE[decoratorName] ?? decoratorName,
            className: name,
            extendsName,
            members: [...statement.members],
        });
    }

    if (found.length > 1) {
        diagnostics.push(
            makeDiagnostic(
                sourceFile,
                sourceFile,
                `A file may contain at most one @ScriptType-decorated class, but found ${found.length}: ${found.map((c) => c.className).join(", ")}.`,
            ),
        );
        return { diagnostics, info: undefined };
    }

    return { diagnostics, info: found[0] };
}

function makeDiagnostic(sourceFile: ts.SourceFile, node: ts.Node, message: string): ts.Diagnostic {
    return {
        category: ts.DiagnosticCategory.Error,
        code: 0,
        file: sourceFile,
        start: node.getStart(sourceFile),
        length: node.getWidth(sourceFile),
        messageText: message,
        source: "tsw",
    };
}
