import * as ts from "typescript";
import {
    IMMEDIATE_INIT_TYPES,
    PASSTHROUGH_TYPES,
} from "../declarations/patches.ts";

export function hasImmediateInit(type: string): boolean {
    return IMMEDIATE_INIT_TYPES.has(type);
}

/**
 * Resolves a TypeScript node's type to an mlua type string.
 * Uses the explicit type annotation if present, otherwise infers via the type checker.
 */
export function resolveType(
    program: ts.Program,
    node: ts.Node,
    isParam = false,
    knownMswTypes?: Set<string>,
): string {
    const raw = getRawTypeString(program, node)
        .replace(/\s+/g, "")
        .replace(/\|undefined/g, "")
        .trim();

    // Function types aren't expressible in mlua parameters
    if (isParam && raw.includes("=>")) return "any";

    // String literal types -> string
    if (raw[0] === '"' || raw[0] === "'" || raw[0] === "`") return "string";

    // Extract base name for generic types like List<string> -> List
    const baseName = raw.includes("<") ? raw.slice(0, raw.indexOf("<")) : raw;
    if (PASSTHROUGH_TYPES.has(baseName)) return raw;
    if (raw.startsWith("Sync")) return raw;
    if (raw.startsWith("AsTable")) return "table";
    if (raw.startsWith("AsAny")) return "any";
    if (raw.startsWith("AsNumber")) return "number";
    if (raw.startsWith("AsString")) return "string";

    // JS built-ins that have no mlua equivalent
    if (baseName === "Promise") return "any";

    // Known MSW types (built-in from .d.mlua and user-defined script classes) pass through
    if (knownMswTypes?.has(baseName)) return raw;

    return "any";
}

function getRawTypeString(program: ts.Program, node: ts.Node): string {
    const typeNode = (node as ts.Node & { type?: ts.TypeNode }).type;
    if (typeNode && typeof typeNode.getText === "function") {
        return typeNode.getText();
    }

    const checker = program.getTypeChecker();
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        const sig = checker.getSignatureFromDeclaration(node);
        if (sig) {
            const ret = checker.getReturnTypeOfSignature(sig);
            return ret.getSymbol()?.getName() ?? checker.typeToString(ret);
        }
        return "any";
    }

    return checker.typeToString(checker.getTypeAtLocation(node));
}
