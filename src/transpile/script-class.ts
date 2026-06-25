import * as ts from "typescript";

export const SCRIPT_TYPE_DECORATORS = new Set([
    "LogicClass",
    "ComponentClass",
    "EventClass",
    "StructClass",
    "BTNodeClass",
    "ItemClass",
    "StateClass",
    "ConditionClass",
]);

type ScriptTypeMapping = string | Record<string, string>;

const DECORATOR_TO_SCRIPT_TYPE: Record<string, ScriptTypeMapping> = {
    LogicClass: "Logic",
    ComponentClass: "Component",
    EventClass: "Event",
    StructClass: "Struct",
    BTNodeClass: {
        ActionNode: "ActionNode",
        DecoratorNode: "DecoratorNode",
    },
    ItemClass: "ItemType",
    StateClass: "StateType",
    ConditionClass: "ConditionType",
};

export interface ScriptClassInfo {
    scriptType: string;
    className: string;
    extendsName: string | undefined;
    members: ts.ClassElement[];
}

export function findScriptTypeDecorator(
    node: ts.ClassDeclaration,
): string | undefined {
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

export function collectScriptClasses(sourceFile: ts.SourceFile | undefined): {
    diagnostics: ts.Diagnostic[];
    infos: ScriptClassInfo[];
} {
    const diagnostics: ts.Diagnostic[] = [];
    const infos: ScriptClassInfo[] = [];

    if (sourceFile === undefined) {
        return { diagnostics, infos };
    }

    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement)) continue;
        const decoratorName = findScriptTypeDecorator(statement);
        if (!decoratorName) continue;

        const name = statement.name?.text;
        if (!name) {
            diagnostics.push(
                makeDiagnostic(
                    sourceFile,
                    statement,
                    "Script type class must have a name.",
                ),
            );
            continue;
        }

        const extendsClause = statement.heritageClauses?.find(
            (c) => c.token === ts.SyntaxKind.ExtendsKeyword,
        );
        const extendsName =
            extendsClause?.types[0]?.expression &&
            ts.isIdentifier(extendsClause.types[0].expression)
                ? extendsClause.types[0].expression.text
                : undefined;

        const typeMapping = DECORATOR_TO_SCRIPT_TYPE[decoratorName];
        let scriptType: string;
        if (typeof typeMapping === "object") {
            const resolved =
                extendsName !== undefined
                    ? typeMapping[extendsName]
                    : undefined;
            if (resolved === undefined) {
                diagnostics.push(
                    makeDiagnostic(
                        sourceFile,
                        statement,
                        `@${decoratorName} requires a class that extends one of: ${Object.keys(typeMapping).join(", ")}.`,
                    ),
                );
                continue;
            }
            scriptType = resolved;
        } else {
            scriptType = typeMapping ?? decoratorName;
        }

        infos.push({
            scriptType,
            className: name,
            extendsName,
            members: [...statement.members],
        });
    }

    return { diagnostics, infos };
}

function makeDiagnostic(
    sourceFile: ts.SourceFile,
    node: ts.Node,
    message: string,
): ts.Diagnostic {
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
