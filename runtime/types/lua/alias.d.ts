type LuaAny = unknown;
type LuaFunc = (...args: LuaAny[]) => LuaAny;
type LuaTable = Record<LuaAny, LuaAny>;