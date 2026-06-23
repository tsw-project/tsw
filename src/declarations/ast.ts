export type ScriptKind = "class" | "enum";
export type MluaScriptType = "Logic" | "Component" | "Service" | "Event" | "Struct" | "Misc" | "Enum" | string;

export interface DocComment {
    description?: string;
    sealed?: boolean;
    deprecated?: boolean;
}

export interface ScriptDeclaration {
    kind: ScriptKind;
    scriptType?: MluaScriptType;
    name: string;
    genericParameters: string[];
    extendsName?: string;
    members: MemberDeclaration[];
    sourcePath: string;
    doc?: DocComment;
}

export type MemberDeclaration =
    | PropertyDeclaration
    | MethodDeclaration
    | ConstructorDeclaration
    | EnumMemberDeclaration;

export interface PropertyDeclaration {
    kind: "property";
    name: string;
    type: string;
    readonly: boolean;
    static: boolean;
    doc?: DocComment;
}

export interface MethodDeclaration {
    kind: "method";
    name: string;
    returnType: string;
    parameters: ParameterDeclaration[];
    static: boolean;
    doc?: DocComment;
}

export interface ConstructorDeclaration {
    kind: "constructor";
    parameters: ParameterDeclaration[];
    doc?: DocComment;
}

export interface EnumMemberDeclaration {
    kind: "enum-member";
    name: string;
    value: string;
}

export interface ParameterDeclaration {
    name: string;
    type: string;
    optional: boolean;
    rest: boolean;
}
