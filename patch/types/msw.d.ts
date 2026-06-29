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

type TSWClassDecorator = (target: abstract new (...args: any[]) => any) => void;

declare function LogicClass(target: abstract new (...args: any[]) => any): void;

declare function ComponentClass(target: abstract new (...args: any[]) => any): void;

declare function EventClass(target: abstract new (...args: any[]) => any): void;

declare function StructClass(target: abstract new (...args: any[]) => any): void;

declare function BTNodeClass(target: abstract new (...args: any[]) => any): void;

declare function ItemClass(target: abstract new (...args: any[]) => any): void;

declare function StateClass(target: abstract new (...args: any[]) => any): void;

declare function ConditionClass(target: abstract new (...args: any[]) => any): void;

declare function ExecSpace(space: "ClientOnly" | "ServerOnly" | "Client" | "Server" | "All"): TSWMethodDecorator;

/** Marks a method as an event handler. The method will be emitted as a `handler` block in mlua. */
declare function EventSender(sender: "Self" | "Entity" | "Model" | "LocalPlayer" | "Service" | "Logic"): TSWMethodDecorator;

/** Marks a property as synchronized between server and client. */
declare const Sync: TSWPropertyDecorator;

interface LuaTable {
    readonly [key: string]: unknown;
    readonly [key: number]: unknown;
}

type SyncTable<K extends keyof any, V> = Record<K, V>;
type SyncList<V> = V[]

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

declare function isvalid<T>(value: T | undefined): value is T
declare const senderUserId: string | undefined