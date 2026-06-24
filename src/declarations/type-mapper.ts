import { must, splitTopLevel } from "./text.ts";

export function toReturnType(rawType: string): string {
    const parts = splitTopLevel(rawType);
    if (parts.length <= 1) {
        return toTypeScriptType(rawType);
    }

    return `[${parts.map(toTypeScriptType).join(", ")}]`;
}

export function toTypeScriptType(rawType: string): string {
    const type = rawType.trim();

    if (type.endsWith("...")) {
        return toTypeScriptType(type.slice(0, -3));
    }

    const functionArrow = splitFunctionArrow(type);
    if (functionArrow) {
        const args = parseTypeArguments(functionArrow.args).map(
            toTypeScriptType,
        );
        const returnType = toReturnType(functionArrow.returnType);
        return `(${args.map((arg, index) => `arg${index}: ${arg}`).join(", ")}) => ${returnType}`;
    }

    const zeroArgFunction = type.match(/^func\s*->\s*(.+)$/);
    if (zeroArgFunction) {
        return `() => ${toReturnType(must(zeroArgFunction[1], "function return type"))}`;
    }

    if (type === "func") {
        return "() => void";
    }

    const functionArgs = type.match(/^func<(.+)>$/);
    if (functionArgs) {
        const args = parseTypeArguments(
            must(functionArgs[1], "function arguments"),
        ).map(toTypeScriptType);
        return `(${args.map((arg, index) => `arg${index}: ${arg}`).join(", ")}) => void`;
    }

    const generic = parseGenericType(type);
    if (generic) {
        const args = generic.args.map(toTypeScriptType);
        if (
            generic.name === "table" ||
            generic.name === "List" ||
            generic.name === "ReadOnlyList"
        ) {
            return args.length === 0 ? "LuaTable" : `${args[0]}[]`;
        }
        if (
            generic.name === "Dictionary" ||
            generic.name === "ReadOnlyDictionary" ||
            generic.name === "SyncDictionary"
        ) {
            return args.length >= 2
                ? `Map<${args[0]}, ${args[1]}>`
                : "Map<unknown, unknown>";
        }
        return `${generic.name}<${args.join(", ")}>`;
    }

    switch (type) {
        case "any":
            return "any";
        case "boolean":
            return "boolean";
        case "float":
        case "int32":
        case "integer":
        case "number":
            return "number";
        case "nil":
            return "undefined";
        case "string":
            return "string";
        case "table":
            return "LuaTable";
        case "void":
            return "void";
        default:
            return type;
    }
}

function splitFunctionArrow(
    type: string,
): { args: string; returnType: string } | undefined {
    const prefix = "func<";
    if (!type.startsWith(prefix)) {
        return undefined;
    }

    let depth = 0;
    for (let index = 0; index < type.length; index++) {
        const char = type[index];
        if (char === "<") depth++;
        if (char === ">") {
            depth--;
            if (depth === 0) {
                const rest = type.slice(index + 1).trim();
                if (rest.startsWith("->")) {
                    return {
                        args: type.slice(prefix.length, index),
                        returnType: rest.slice("->".length).trim(),
                    };
                }
                return undefined;
            }
        }
    }

    return undefined;
}

function parseGenericType(
    type: string,
): { name: string; args: string[] } | undefined {
    const openIndex = type.indexOf("<");
    if (openIndex === -1 || !type.endsWith(">")) {
        return undefined;
    }

    return {
        name: type.slice(0, openIndex),
        args: parseTypeArguments(type.slice(openIndex + 1, -1)),
    };
}

function parseTypeArguments(rawArguments: string): string[] {
    return splitTopLevel(rawArguments).filter(Boolean);
}
