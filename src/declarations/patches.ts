import type { MemberPatch } from "./patcher.ts";

export const SUPPORT = `\
type TSWMethodDecorator = (
    targetOrValue: object | Function,
    keyOrContext: string | symbol | ClassMethodDecoratorContext,
    descriptor?: PropertyDescriptor,
) => void;

type TSWPropertyDecorator = (
    targetOrValue: object | undefined,
    keyOrContext: string | symbol | ClassFieldDecoratorContext,
    descriptor?: PropertyDescriptor,
) => void;

declare function ExecSpace(space: "ClientOnly" | "ServerOnly" | "Client" | "Server" | "All"): TSWMethodDecorator;

/** Marks a method as an event handler. The method will be emitted as a \`handler\` block in mlua. */
declare function EventSender(sender: "Self" | "Entity" | "Model" | "LocalPlayer" | "Service" | "Logic"): TSWMethodDecorator;

/** Marks a property as synchronized between server and client. */
declare const Sync: TSWPropertyDecorator;

/** Lua print function. */
declare function print(...args: any[]): void;

interface LuaTable {
    readonly [key: string]: unknown;
    readonly [key: number]: unknown;
}

type SyncTable<K extends keyof any, V> = Record<K, V>;

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

declare const _G: Record<string, any>;
declare function isvalid<T>(value: T | undefined): value is T
declare const senderUserId: string | undefined
`;

export const PATCHES: Record<string, MemberPatch | MemberPatch[]> = {
    "Entity.GetComponent": {
        parameterTypes: ["Type"],
        rawSignature:
            "GetComponent<T extends Component>(componentType: abstract new (...args: any[]) => T): T | undefined",
    },

    "Entity.ConnectEvent": {
        parameterTypes: ["Type", "IScriptFunction"],
        rawSignature:
            "ConnectEvent<T>(eventType: abstract new (...args: any[]) => T, eventHandler: (event: T) => void): EventHandlerBase"
    }
};
