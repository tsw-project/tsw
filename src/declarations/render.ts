import type {
    DocComment,
    EnumMemberDeclaration,
    MemberDeclaration,
    MethodDeclaration,
    ParameterDeclaration,
    ScriptDeclaration,
} from "./ast.ts";
import { SCRIPT_TYPE_DECORATORS } from "../transpile/script-class.ts";

function renderDocComment(doc: DocComment | undefined, indent = ""): string {
    if (!doc) return "";
    const tags: string[] = [];
    if (doc.description) tags.push(` * ${doc.description}`);
    if (doc.sealed) tags.push(` * @sealed`);
    if (doc.deprecated) tags.push(` * @deprecated`);
    if (tags.length === 0) return "";
    return [
        `${indent}/**`,
        ...tags.map((t) => `${indent}${t}`),
        `${indent} */`,
        "",
    ].join("\n");
}

export function renderDeclaration(declaration: ScriptDeclaration): string {
    const lines = [
        "/* This file is generated from .d.mlua declarations. */",
        "",
    ];

    if (declaration.kind === "enum") {
        return renderEnumDeclaration(declaration, lines);
    }

    const genericParameters =
        declaration.genericParameters.length > 0
            ? `<${declaration.genericParameters.join(", ")}>`
            : "";
    const extendsClause = declaration.extendsName
        ? ` extends ${declaration.extendsName}`
        : "";
    const classDoc = renderDocComment(declaration.doc);
    if (classDoc) lines.push(classDoc.trimEnd());
    lines.push(
        `declare class ${declaration.name}${genericParameters}${extendsClause} {`,
    );

    for (const member of declaration.members) {
        if (member.kind === "enum-member") {
            continue;
        }

        const memberDoc = renderDocComment(
            "doc" in member ? member.doc : undefined,
            "    ",
        );
        if (memberDoc) lines.push(memberDoc.trimEnd());
        lines.push(`    ${renderClassMember(member)}`);
    }

    lines.push("", "}");

    if (declaration.scriptType === "Service") {
        lines.push(
            "",
            `declare const _${declaration.name}: ${declaration.name};`,
        );
    }

    return `${lines.join("\n")}\n`;
}

export function renderSupportDeclaration(): string {
    const decoratorDeclarations = [...SCRIPT_TYPE_DECORATORS]
        .map(
            (name) =>
                `declare function ${name}(target: abstract new (...args: any[]) => any): void;`,
        )
        .join("\n\n");

    return `/* Shared support declarations for generated Maplestory Worlds types. */

${decoratorDeclarations}


declare function ExecSpace(space: "ClientOnly" | "ServerOnly" | "All"): (target: object, key: string, descriptor: PropertyDescriptor) => void;

/** Marks a method as an event handler. The method will be emitted as a \`handler\` block in mlua. */
declare function EventSender(sender: "Self" | "Entity" | "Model" | "LocalPlayer" | "Service" | "Logic"): (target: any, key: string, descriptor: PropertyDescriptor) => void;

/** Marks a property as synchronized between server and client. */
declare function Sync(target: any, propertyKey: string, descriptor?: PropertyDescriptor): void;

/** Lua print function. */
declare function print(...args: any[]): void;

interface LuaTable {
    readonly [key: string]: unknown;
    readonly [key: number]: unknown;
}

type EditorAlignmentType = unknown;
type EditorSystemPalette = unknown;
type EventHandlerBase = unknown;
type EntityOrigin = unknown;
type EntityOriginType = unknown;
type IEventSender = unknown;
type IEmbeddedSpriteAnimPlayer = unknown;
type IScriptFunction = (...args: any[]) => any;
type IScriptable = unknown;
type IUser = unknown;
type JObject = unknown;
type MapleAvatarItemData = unknown;
type MODScriptAsyncTask = unknown;
type Model = unknown;
type StudioAvatarActionType = unknown;
type TileMapVersion = unknown;
type Type = unknown;
`;
}

export function renderIndexDeclaration(references: string[]): string {
    return [
        "/* Generated from Maplestory Worlds native .d.mlua declarations. */",
        ...references.map(
            (reference) => `/// <reference path="./${reference}" />`,
        ),
        "",
    ].join("\n");
}

function renderEnumDeclaration(
    declaration: ScriptDeclaration,
    lines: string[],
): string {
    const enumMembers = declaration.members.filter(
        (member): member is EnumMemberDeclaration =>
            member.kind === "enum-member",
    );
    const seenEnumMembers = new Set<string>();
    lines.push(`declare enum ${declaration.name} {`);

    for (const member of enumMembers) {
        if (seenEnumMembers.has(member.name)) {
            lines.push(
                `    // Duplicate .d.mlua member omitted: ${member.name} = ${member.value}`,
            );
            continue;
        }

        seenEnumMembers.add(member.name);
        lines.push(`    ${member.name} = ${member.value},`);
    }

    lines.push("}");

    const enumMethods = declaration.members.filter(
        (member): member is MethodDeclaration => member.kind === "method",
    );
    if (enumMethods.length > 0) {
        lines.push("", `declare namespace ${declaration.name} {`);
        for (const method of enumMethods) {
            lines.push(`    function ${renderMethodSignature(method)};`);
        }
        lines.push("}");
    }

    return `${lines.join("\n")}\n`;
}

function renderClassMember(
    member: Exclude<MemberDeclaration, EnumMemberDeclaration>,
): string {
    if (member.kind === "property") {
        const staticPrefix = member.static ? "static " : "";
        const readonlyPrefix = member.readonly ? "readonly " : "";
        return `${staticPrefix}${readonlyPrefix}${member.name}: ${member.type};`;
    }

    if (member.kind === "constructor") {
        return `constructor(${renderParameters(member.parameters)});`;
    }

    const staticPrefix = member.static ? "static " : "";
    if (member.rawSignature !== undefined) {
        return `${staticPrefix}${member.rawSignature};`;
    }
    return `${staticPrefix}${renderMethodSignature(member)};`;
}

function renderMethodSignature(method: MethodDeclaration): string {
    return `${method.name}(${renderParameters(method.parameters)}): ${method.returnType}`;
}

function renderParameters(parameters: ParameterDeclaration[]): string {
    return parameters
        .map((parameter) => {
            const prefix = parameter.rest ? "..." : "";
            const optional = parameter.optional ? "?" : "";
            const type = parameter.rest
                ? `${parameter.type}[]`
                : parameter.type;
            return `${prefix}${parameter.name}${optional}: ${type}`;
        })
        .join(", ");
}
