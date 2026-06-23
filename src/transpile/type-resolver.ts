import * as ts from "typescript";

// Types that require an explicit = value initializer in mlua property declarations
const IMMEDIATE_INIT_TYPES = new Set([
    "number", "int32", "float", "integer",
    "boolean",
    "Entity", "EntityRef",
]);

export function hasImmediateInit(type: string): boolean {
    return IMMEDIATE_INIT_TYPES.has(type);
}

const PASSTHROUGH_TYPES = new Set([
    "void", "string", "number", "boolean",
    "Entity",
    "Vector2", "Vector3", "Vector4",
    "FastVector2", "FastVector3",
    "Quaternion",
    "Color",
    "List", "Dictionary",
    "SyncList", "SyncDictionary",
    "ReadOnlyList", "ReadOnlyDictionary",
]);

/**
 * Resolves a TypeScript node's type to an mlua type string.
 * Uses the explicit type annotation if present, otherwise infers via the type checker.
 */
export function resolveType(program: ts.Program, node: ts.Node, isParam = false): string {
    const raw = getRawTypeString(program, node)
        .replace(/\s+/g, "")
        .replace(/\|undefined/g, "")
        .trim();

    // Function types aren't expressible in mlua parameters
    if (isParam && raw.includes("=>")) return "any";

    // String literal types → string
    if (raw[0] === '"' || raw[0] === "'" || raw[0] === "`") return "string";

    // Extract base name for generic types like List<string> → List
    const baseName = raw.includes("<") ? raw.slice(0, raw.indexOf("<")) : raw;
    if (PASSTHROUGH_TYPES.has(baseName)) return raw;
    if (raw.startsWith("Sync")) return raw;
    if (raw.startsWith("AsTable")) return "table";
    if (raw.startsWith("AsAny")) return "any";
    if (raw.startsWith("AsNumber")) return "number";
    if (raw.startsWith("AsString")) return "string";

    return "any";
}

function getRawTypeString(program: ts.Program, node: ts.Node): string {
    const typeNode = (node as any).type as ts.TypeNode | undefined;
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
