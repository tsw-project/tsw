import type {
    MemberDeclaration,
    ParameterDeclaration,
    ScriptDeclaration,
    DocComment,
} from "./ast";
import { must, splitTopLevel } from "./text";
import { toReturnType, toTypeScriptType } from "./type-mapper";

export async function parseDeclarationFile(
    sourcePath: string,
): Promise<ScriptDeclaration> {
    const text = await Bun.file(sourcePath).text();
    const lines = text.split(/\r?\n/);

    let script: ScriptDeclaration | undefined;
    const pendingAnnotations: string[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0 || line === "end") {
            continue;
        }

        if (line.startsWith("---@") || line.startsWith("@")) {
            pendingAnnotations.push(line);
            continue;
        }

        const scriptMatch = line.match(
            /^script\s+([A-Za-z_]\w*)(?:<([^>]+)>)?(?:\s+extends\s+([A-Za-z_]\w*))?$/,
        );
        if (scriptMatch) {
            script = {
                kind: pendingAnnotations.includes("@Enum") ? "enum" : "class",
                name: must(scriptMatch[1], "script name"),
                genericParameters: splitTopLevel(scriptMatch[2] ?? ",").filter(
                    Boolean,
                ),
                extendsName: scriptMatch[3],
                members: [],
                sourcePath,
                scriptType: parseScriptType(pendingAnnotations),
                doc: parseDocComment(pendingAnnotations),
            };
            pendingAnnotations.length = 0;
            continue;
        }

        if (!script) {
            pendingAnnotations.length = 0;
            continue;
        }

        const member = parseMember(line, pendingAnnotations);
        if (!member) {
            throw new Error(`Could not parse ${sourcePath}: ${line}`);
        }

        script.members.push(member);
        pendingAnnotations.length = 0;
    }

    if (!script) {
        throw new Error(`Missing script declaration in ${sourcePath}`);
    }

    return script;
}

function parseScriptType(annotations: string[]): string | undefined {
    for (const a of annotations) {
        const m = a.match(/^@([A-Za-z]\w*)$/);
        if (m) return m[1];
    }
    return undefined;
}

function parseDocComment(annotations: string[]): DocComment | undefined {
    const description = annotations
        .find((a) => a.startsWith('---@description'))
        ?.match(/---@description\s+"([^"]+)"/)?.[1];
    const sealed = annotations.includes("---@sealed");
    const deprecated = annotations.includes("---@deprecated");
    if (!description && !sealed && !deprecated) return undefined;
    return {
        ...(description && { description }),
        ...(sealed && { sealed }),
        ...(deprecated && { deprecated }),
    };
}

function parseMember(line: string, annotations: string[]): MemberDeclaration | undefined {
    const doc = parseDocComment(annotations);

    const enumMemberMatch = line.match(
        /^member\s+([A-Za-z_]\w*)\s*=\s*(-?\d+)$/,
    );
    if (enumMemberMatch) {
        return {
            kind: "enum-member",
            name: must(enumMemberMatch[1], "enum member name"),
            value: must(enumMemberMatch[2], "enum member value"),
        };
    }

    const propertyMatch = line.match(
        /^(?:(static)\s+)?(?:(readonly)\s+)?property\s+(.+?)\s+([A-Za-z_]\w*)(?:\s*=.+)?$/,
    );
    if (propertyMatch) {
        return {
            kind: "property",
            static: Boolean(propertyMatch[1]),
            readonly: Boolean(propertyMatch[2]),
            type: toTypeScriptType(must(propertyMatch[3], "property type")),
            name: must(propertyMatch[4], "property name"),
            doc,
        };
    }

    const methodMatch = line.match(
        /^(?:(static)\s+)?method\s+(.+?)\s+([A-Za-z_]\w*)\((.*)\)\s+end$/,
    );
    if (methodMatch) {
        return {
            kind: "method",
            static: Boolean(methodMatch[1]),
            returnType: toReturnType(
                must(methodMatch[2], "method return type"),
            ),
            name: must(methodMatch[3], "method name"),
            parameters: parseParameters(
                must(methodMatch[4], "method parameters"),
            ),
            doc,
        };
    }

    const constructorMatch = line.match(
        /^constructor\s+[A-Za-z_]\w*\((.*)\)\s+end$/,
    );
    if (constructorMatch) {
        return {
            kind: "constructor",
            parameters: parseParameters(
                must(constructorMatch[1], "constructor parameters"),
            ),
            doc,
        };
    }

    const emitterMatch = line.match(/^emitter\s+([A-Za-z_]\w*)\((.*)\)\s+end$/);
    if (emitterMatch) {
        return {
            kind: "method",
            static: false,
            returnType: "void",
            name: must(emitterMatch[1], "emitter name"),
            parameters: parseParameters(
                must(emitterMatch[2], "emitter parameters"),
            ),
            doc,
        };
    }

    const operatorMatch = line.match(
        /^static\s+operator\s+(.+?)\s+([A-Za-z_]\w*)\((.*)\)\s+end$/,
    );
    if (operatorMatch) {
        return {
            kind: "method",
            static: true,
            returnType: toReturnType(
                must(operatorMatch[1], "operator return type"),
            ),
            name: `operator${must(operatorMatch[2], "operator name")}`,
            parameters: parseParameters(
                must(operatorMatch[3], "operator parameters"),
            ),
        };
    }

    return undefined;
}

function parseParameters(rawParameters: string): ParameterDeclaration[] {
    if (rawParameters.trim().length === 0) {
        return [];
    }

    return splitTopLevel(rawParameters).map((rawParameter, index) => {
        const withoutDefault = splitDefault(rawParameter);
        const parsed = splitParameterTypeAndName(
            withoutDefault.value,
            rawParameter,
        );
        const rest = parsed.type.endsWith("...");
        const type = rest ? parsed.type.slice(0, -3).trim() : parsed.type;

        return {
            name: sanitizeParameterName(parsed.name, index),
            type: toTypeScriptType(type),
            optional: withoutDefault.hadDefault && !rest,
            rest,
        };
    });
}

function splitParameterTypeAndName(
    value: string,
    rawParameter: string,
): { type: string; name: string } {
    let depth = 0;
    for (let index = value.length - 1; index >= 0; index--) {
        const char = value[index];
        if ((char === ">" && value[index - 1] !== "-") || char === ")") depth++;
        if (char === "<" || char === "(") depth--;
        if (/\s/.test(char ?? "") && depth === 0) {
            const type = value.slice(0, index).trim();
            const name = value.slice(index + 1).trim();
            if (type.length > 0 && /^[A-Za-z_]\w*$/.test(name)) {
                return { type, name };
            }
        }
    }

    throw new Error(`Could not parse parameter: ${rawParameter}`);
}

function splitDefault(rawParameter: string): {
    value: string;
    hadDefault: boolean;
} {
    let depth = 0;
    for (let index = 0; index < rawParameter.length; index++) {
        const char = rawParameter[index];
        if (char === "<" || char === "(") depth++;
        if ((char === ">" && rawParameter[index - 1] !== "-") || char === ")")
            depth--;
        if (char === "=" && depth === 0) {
            return {
                value: rawParameter.slice(0, index).trim(),
                hadDefault: true,
            };
        }
    }

    return { value: rawParameter.trim(), hadDefault: false };
}

function sanitizeParameterName(name: string, index: number): string {
    if (
        name === "table" ||
        name === "function" ||
        name === "string" ||
        name === "number"
    ) {
        return `${name}_${index}`;
    }

    return name;
}
