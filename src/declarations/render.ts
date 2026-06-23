import type {
    EnumMemberDeclaration,
    MemberDeclaration,
    MethodDeclaration,
    ParameterDeclaration,
    ScriptDeclaration,
} from "./ast";

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
    lines.push(
        `declare class ${declaration.name}${genericParameters}${extendsClause} {`,
    );

    for (const member of declaration.members) {
        if (member.kind === "enum-member") {
            continue;
        }

        lines.push(`    ${renderClassMember(member)}`);
    }

    lines.push("", "}");

    return `${lines.join("\n")}\n`;
}

export function renderSupportDeclaration(): string {
    return `/* Shared support declarations for generated Maplestory Worlds types. */

/** Marks a class as a Logic script. Use instead of \`@Logic\` (which conflicts with the Logic base class). */
declare function LogicClass(target: abstract new (...args: any[]) => any): void;

/** Marks a class as a Component script. Use instead of \`@Component\` (which conflicts with the Component base class). */
declare function ComponentClass(target: abstract new (...args: any[]) => any): void;

/** Marks a class as an Event script. */
declare function EventClass(target: abstract new (...args: any[]) => any): void;

/** Marks a class as a Struct script. */
declare function StructClass(target: abstract new (...args: any[]) => any): void;


declare function ExecSpace(space: "ClientOnly" | "ServerOnly" | "All"): (target: object, key: string, descriptor: PropertyDescriptor) => void;

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
