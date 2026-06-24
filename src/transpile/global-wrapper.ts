import fs from "node:fs";
import path from "node:path";
import * as tstl from "typescript-to-lua";
import { LUALIB_LOAD_METHOD, LUALIB_SCRIPT_NAME } from "./lualib-wrapper.ts";
import { writeCodeblock } from "./msw-files.ts";

export const TSW_MANAGER_SCRIPT_NAME = "TSWGlobal";
export const TSW_MANAGER_LOAD_METHOD = "Load";

export interface TopLevelLuaStatement {
    statement: tstl.Statement;
    lua: string;
}

export interface TopLevelLuaChunk {
    statements: TopLevelLuaStatement[];
}

function getCallIdentifierName(
    expression: tstl.Expression,
): string | undefined {
    if (!tstl.isCallExpression(expression)) return undefined;
    return tstl.isIdentifier(expression.expression)
        ? expression.expression.text
        : undefined;
}

function isSingleRightCall(
    statement: tstl.Statement,
    callName: string,
): statement is tstl.AssignmentStatement | tstl.VariableDeclarationStatement {
    if (
        !tstl.isAssignmentStatement(statement) &&
        !tstl.isVariableDeclarationStatement(statement)
    ) {
        return false;
    }
    const right = statement.right?.[0];
    return (
        statement.right?.length === 1 &&
        right !== undefined &&
        getCallIdentifierName(right) === callName
    );
}

function getClassDeclarationName(
    statement: tstl.Statement,
): string | undefined {
    if (!isSingleRightCall(statement, "__TS__Class")) return undefined;
    const left = statement.left[0];
    return statement.left.length === 1 && left && tstl.isIdentifier(left)
        ? left.text
        : undefined;
}

function isClassExtendsStatement(statement: tstl.Statement): boolean {
    if (!tstl.isExpressionStatement(statement)) return false;
    return getCallIdentifierName(statement.expression) === "__TS__ClassExtends";
}

function expressionMentionsClass(
    expression: tstl.Expression,
    classNames: Set<string>,
): boolean {
    if (tstl.isIdentifier(expression)) {
        return classNames.has(expression.text);
    }
    if (tstl.isTableIndexExpression(expression)) {
        return (
            expressionMentionsClass(expression.table, classNames) ||
            expressionMentionsClass(expression.index, classNames)
        );
    }
    if (tstl.isCallExpression(expression)) {
        return (
            expressionMentionsClass(expression.expression, classNames) ||
            expression.params.some((param) =>
                expressionMentionsClass(param, classNames),
            )
        );
    }
    if (tstl.isMethodCallExpression(expression)) {
        return (
            expressionMentionsClass(expression.prefixExpression, classNames) ||
            expression.params.some((param) =>
                expressionMentionsClass(param, classNames),
            )
        );
    }
    if (tstl.isFunctionExpression(expression)) {
        return expression.body.statements.some((statement) =>
            statementMentionsClass(statement, classNames),
        );
    }
    if (tstl.isTableExpression(expression)) {
        return expression.fields.some(
            (field) =>
                expressionMentionsClass(field.value, classNames) ||
                (field.key !== undefined &&
                    expressionMentionsClass(field.key, classNames)),
        );
    }
    if (tstl.isTableFieldExpression(expression)) {
        return (
            expressionMentionsClass(expression.value, classNames) ||
            (expression.key !== undefined &&
                expressionMentionsClass(expression.key, classNames))
        );
    }
    if (tstl.isUnaryExpression(expression)) {
        return expressionMentionsClass(expression.operand, classNames);
    }
    if (tstl.isBinaryExpression(expression)) {
        return (
            expressionMentionsClass(expression.left, classNames) ||
            expressionMentionsClass(expression.right, classNames)
        );
    }
    if (tstl.isParenthesizedExpression(expression)) {
        return expressionMentionsClass(expression.expression, classNames);
    }
    if (tstl.isConditionalExpression(expression)) {
        return (
            expressionMentionsClass(expression.condition, classNames) ||
            expressionMentionsClass(expression.whenTrue, classNames) ||
            expressionMentionsClass(expression.whenFalse, classNames)
        );
    }
    return false;
}

function blockMentionsClass(
    block: tstl.Block,
    classNames: Set<string>,
): boolean {
    return block.statements.some((statement) =>
        statementMentionsClass(statement, classNames),
    );
}

function statementMentionsClass(
    statement: tstl.Statement,
    classNames: Set<string>,
): boolean {
    if (tstl.isAssignmentStatement(statement)) {
        return (
            statement.left.some((expr) =>
                expressionMentionsClass(expr, classNames),
            ) ||
            statement.right.some((expr) =>
                expressionMentionsClass(expr, classNames),
            )
        );
    }
    if (tstl.isVariableDeclarationStatement(statement)) {
        return (
            statement.left.some((expr) =>
                expressionMentionsClass(expr, classNames),
            ) ||
            statement.right?.some((expr) =>
                expressionMentionsClass(expr, classNames),
            ) === true
        );
    }
    if (tstl.isExpressionStatement(statement)) {
        return expressionMentionsClass(statement.expression, classNames);
    }
    if (tstl.isDoStatement(statement)) {
        return statement.statements.some((child) =>
            statementMentionsClass(child, classNames),
        );
    }
    if (tstl.isIfStatement(statement)) {
        const elseMentionsClass =
            statement.elseBlock !== undefined &&
            (tstl.isBlock(statement.elseBlock)
                ? blockMentionsClass(statement.elseBlock, classNames)
                : statementMentionsClass(statement.elseBlock, classNames));
        return (
            expressionMentionsClass(statement.condition, classNames) ||
            blockMentionsClass(statement.ifBlock, classNames) ||
            elseMentionsClass
        );
    }
    if (tstl.isIterationStatement(statement)) {
        return blockMentionsClass(statement.body, classNames);
    }
    if (tstl.isReturnStatement(statement)) {
        return statement.expressions.some((expr) =>
            expressionMentionsClass(expr, classNames),
        );
    }
    return false;
}

function isFreeFunction(statement: tstl.Statement): boolean {
    if (
        !tstl.isAssignmentStatement(statement) &&
        !tstl.isVariableDeclarationStatement(statement)
    ) {
        return false;
    }
    if (!tstl.isFunctionDefinition(statement)) return false;
    const left = statement.left[0];
    return (
        statement.left.length === 1 &&
        left !== undefined &&
        tstl.isIdentifier(left)
    );
}

function sortTopLevelStatements(
    chunks: Iterable<TopLevelLuaChunk>,
): TopLevelLuaStatement[] {
    const statements = [...chunks].flatMap((chunk) => chunk.statements);
    const classNames = new Set<string>();
    for (const { statement } of statements) {
        const className = getClassDeclarationName(statement);
        if (className) classNames.add(className);
    }

    const freeFunctions: TopLevelLuaStatement[] = [];
    const classDeclarations: TopLevelLuaStatement[] = [];
    const classExtends: TopLevelLuaStatement[] = [];
    const classRelated: TopLevelLuaStatement[] = [];
    const other: TopLevelLuaStatement[] = [];

    for (const item of statements) {
        const { statement } = item;
        if (isFreeFunction(statement)) {
            freeFunctions.push(item);
        } else if (getClassDeclarationName(statement) !== undefined) {
            classDeclarations.push(item);
        } else if (isClassExtendsStatement(statement)) {
            classExtends.push(item);
        } else if (statementMentionsClass(statement, classNames)) {
            classRelated.push(item);
        } else {
            other.push(item);
        }
    }

    return [
        ...freeFunctions,
        ...classDeclarations,
        ...classExtends,
        ...classRelated,
        ...other,
    ];
}

function indentLua(lua: string): string {
    return lua
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => `\t\t${line}`)
        .join("\n");
}

export function writeTSWGlobalScript(
    outDir: string,
    chunks: Iterable<TopLevelLuaChunk>,
): void {
    const topLevelLua = sortTopLevelStatements(chunks)
        .map(({ lua }) => indentLua(lua))
        .filter((lua) => lua.length > 0)
        .join("\n");

    const loadBody = [
        `\t\tif _G["__tsw_manager_loaded"] then return end`,
        `\t\t_G["__tsw_manager_loaded"] = true`,
        `\t\t_${LUALIB_SCRIPT_NAME}:${LUALIB_LOAD_METHOD}()`,
        ...(topLevelLua ? [topLevelLua] : []),
    ];

    const mlua = [
        `@Logic`,
        `script ${TSW_MANAGER_SCRIPT_NAME} extends Logic`,
        ``,
        `\tmethod void OnBeginPlay()`,
        `\t\tself:${TSW_MANAGER_LOAD_METHOD}()`,
        `\tend`,
        ``,
        `\tmethod void ${TSW_MANAGER_LOAD_METHOD}()`,
        ...loadBody,
        `\tend`,
        ``,
        `end`,
    ].join("\n");

    fs.writeFileSync(
        path.join(outDir, `${TSW_MANAGER_SCRIPT_NAME}.mlua`),
        mlua,
    );
    writeCodeblock(
        path.join(outDir, `${TSW_MANAGER_SCRIPT_NAME}.codeblock`),
        TSW_MANAGER_SCRIPT_NAME,
        "Logic",
    );
}
