/**
 * Calls `error` if `v` is false or nil.
 * If `v` is true, returns all its parameters.
 * When an error occurs, `message` is the error entity; defaults to
 * `"assertion failed!"` when absent.
 */
declare function assert(v: LuaAny, message?: string): LuaAny;

/**
 * Exits the current function and raises an error with `message`.
 * `level` specifies how to get the error position (default `1` = the
 * function that called `error`).
 */
declare function error(message: string, level?: number): void;

/**
 * Generic interface to the garbage collector.
 * Behaviour depends on `opt`:
 * - `"collect"` – performs a full garbage-collection cycle (default).
 * - `"stop"` / `"restart"` – stops / restarts automatic collection.
 * - `"count"` – returns total memory in use (kB) plus a remainder.
 * - `"step"` – performs a collection step; `arg` is the step size.
 * - `"isrunning"` – returns a boolean.
 * - `"incremental"` / `"generational"` – changes GC mode.
 */
declare function collectgarbage(opt?: string, arg?: LuaAny): LuaAny;

/**
 * Returns the metatable of `object`.
 * - Returns `nil` if `object` has no metatable.
 * - Returns the value of `__metatable` if that field is set on the metatable.
 * - Otherwise returns the metatable itself.
 */
declare function getmetatable(object: LuaAny): LuaAny;

/**
 * Returns an iterator function, `t`, and `0` so that the construction
 * `for i, v in ipairs(t)` iterates over numeric index–value pairs.
 */
declare function ipairs(t: LuaAny): LuaMultiReturn<[LuaFunc, LuaAny, number]>;

/**
 * Returns the key and value that follow `index` in `table`.
 * Pass `nil` (or omit `index`) to get the first entry.
 * The enumeration order is unspecified, even for numeric keys.
 */
declare function next(table: LuaTable, index?: LuaAny): LuaMultiReturn<[LuaAny, LuaAny]>;

/**
 * Returns an iterator function, `t`, and `nil` so that the construction
 * `for k, v in pairs(t)` iterates over all key–value pairs.
 */
declare function pairs(t: LuaAny): LuaMultiReturn<[LuaFunc, LuaAny, LuaAny]>;

/**
 * Calls `f` in protected mode with the given arguments.
 * Errors inside `f` are caught instead of propagating.
 * - On success: returns `true` followed by all results of `f`.
 * - On error:   returns `false` followed by the error message.
 */
declare function pcall(f: LuaFunc, ...args: LuaAny[]): LuaMultiReturn<[boolean, ...LuaAny[]]>;

/**
 * Converts each argument to a string via `tostring` and writes the
 * results to standard output.
 */
declare function print(...args: LuaAny[]): void;

/**
 * Checks whether `v1 === v2` without invoking the `__eq` metamethod.
 */
declare function rawequal(v1: LuaAny, v2: LuaAny): boolean;

/**
 * Gets the real value of `table[index]` without invoking the `__index`
 * metamethod.
 */
declare function rawget(table: LuaTable, index: LuaAny): LuaAny;

/**
 * Returns the length of `v` without invoking the `__len` metamethod.
 */
declare function rawlen(v: LuaAny): number;

/**
 * Sets `table[index]` to `value` without invoking the `__newindex`
 * metamethod, then returns the table.
 */
declare function rawset(table: LuaTable, index: LuaAny, value: LuaAny): LuaTable;

/**
 * - If `index` is a number, returns all arguments after position `index`.
 *   A negative number indexes from the end.
 * - If `index` is `"#"`, returns the total count of extra arguments.
 */
declare function select(index: number | "#", ...args: LuaAny[]): LuaAny;

/**
 * Sets the metatable of `table` to `metatable` and returns `table`.
 */
declare function setmetatable(table: LuaTable, metatable: LuaTable): LuaTable;

/**
 * Converts `e` to a number and returns it, or `nil` if conversion is
 * not possible. `base` (2–36) is used when `e` is a string.
 */
declare function tonumber(e: LuaAny, base?: number): number | null;

/**
 * Converts `v` to a string.
 * If the metatable of `v` has a `__tostring` field, calls it with `v`
 * and returns the result.
 */
declare function tostring(v: LuaAny): string;

/**
 * Returns the type name of `v` as a string:
 * `"nil"`, `"boolean"`, `"number"`, `"string"`, `"table"`, `"function"`,
 * `"thread"`, or `"userdata"`.
 */
declare function type(v: LuaAny): string;

/**
 * Like `pcall`, but also sets a new message handler `msgh` which is
 * called with the error object when an error occurs.
 * - On success: returns `true` followed by all results of `f`.
 * - On error:   returns `false` followed by the result of `msgh`.
 */
declare function xpcall(f: LuaFunc, msgh: LuaFunc, ...args: LuaAny[]): LuaMultiReturn<[boolean, ...LuaAny[]]>;

/**
 * Swaps the keys and values of `table` and returns the resulting table.
 */
declare function __enum(table: LuaTable): LuaTable;

/**
 * Suspends the current script execution for `seconds`.
 */
declare function wait(seconds: number): void;

/**
 * Checks whether the internal state of `object` is valid.
 * Can detect `nil` values as well as deleted Entities and Components.
 */
declare function isvalid(object: LuaAny): boolean;

/**
 * Converts each argument to a string via `tostring` and writes the
 * result to the **information** log.
 */
declare function log(...args: LuaAny[]): void;

/**
 * Converts each argument to a string via `tostring` and writes the
 * result to the **warning** log.
 */
declare function log_warning(...args: LuaAny[]): void;

/**
 * Converts each argument to a string via `tostring` and writes the
 * result to the **error** log.
 */
declare function log_error(...args: LuaAny[]): void;

declare const _G: Record<string, any>