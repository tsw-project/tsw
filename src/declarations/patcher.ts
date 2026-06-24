import type { MethodDeclaration, ScriptDeclaration } from "./ast.ts";
import { PATCHES } from "./patches.ts";

export interface MemberPatch {
    // property fields
    readonly?: boolean;
    // method fields
    parameterTypes?: string[];
    returnType?: string;
    rawSignature?: string;
    parameters?: Array<{ index: number; type?: string; optional?: boolean }>;
    // shared
    type?: string;
}


export function applyPatches(declarations: ScriptDeclaration[]): void {
    for (const decl of declarations) {
        for (const member of decl.members) {
            if (member.kind === "enum-member" || member.kind === "constructor") {
                continue;
            }

            const key = `${decl.name}.${member.name}`;
            const entry = PATCHES[key];
            if (!entry) continue;

            const patches = Array.isArray(entry) ? entry : [entry];
            for (const patch of patches) {
                if (member.kind === "property") {
                    if (patch.type !== undefined) member.type = patch.type;
                    if (patch.readonly !== undefined) member.readonly = patch.readonly;
                } else if (member.kind === "method") {
                    applyMethodPatch(member, patch);
                }
            }
        }
    }
}

function applyMethodPatch(member: MethodDeclaration, patch: MemberPatch): void {
    if (patch.parameterTypes !== undefined) {
        const actualTypes = member.parameters.map((p) => p.type);
        if (!arrayEquals(actualTypes, patch.parameterTypes)) return;
    }

    if (patch.returnType !== undefined) member.returnType = patch.returnType;
    if (patch.rawSignature !== undefined) member.rawSignature = patch.rawSignature;
    if (patch.type !== undefined) member.returnType = patch.type;

    if (patch.parameters) {
        for (const paramPatch of patch.parameters) {
            const param = member.parameters[paramPatch.index];
            if (!param) continue;
            if (paramPatch.type !== undefined) param.type = paramPatch.type;
            if (paramPatch.optional !== undefined) param.optional = paramPatch.optional;
        }
    }
}

function arrayEquals(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}
