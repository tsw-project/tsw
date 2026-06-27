declare namespace table {
    /**
     * Concatenates elements `table[i]` through `table[j]` into a single
     * string, inserting `sep` between adjacent elements.
     * Defaults: `sep = ""`, `i = 1`, `j = #table`.
     */
    function concat(
        table: LuaAny[],
        sep?: string,
        i?: number,
        j?: number
    ): string;

    /**
     * Appends `value` to the end of `table`.
     */
    function insert(table: LuaAny[], value: LuaAny): void;

    /**
     * Inserts `value` at position `pos` in `table`, shifting later
     * elements up.
     */
    function insert(table: LuaAny[], pos: number, value: LuaAny): void;

    /**
     * Removes and returns the element at position `pos` (default: last
     * element), shifting later elements down.
     */
    function remove(table: LuaAny[], pos?: number): LuaAny;

    /**
     * Sorts the elements of `table` in-place using `comp` as the
     * comparator. `comp(a, b)` should return `true` when `a` must come
     * before `b`.
     */
    function sort(table: LuaAny[], comp: (a: LuaAny, b: LuaAny) => boolean): void;

    /**
     * Sorts the elements of `table` in-place using the default `<`
     * ordering.
     */
    function sort(table: LuaAny[]): void;

    /**
     * Copies elements `a1[f]` through `a1[e]` into `a2` starting at
     * index `t` (defaults `a2 = a1`), then returns `a2`.
     * Equivalent to multiple assignment: `a2[t], ... = a1[f], ..., a1[e]`.
     */
    function move(
        a1: LuaAny[],
        f: number,
        e: number,
        t: number,
        a2?: LuaAny[]
    ): LuaAny[];

    /**
     * Returns a new table containing all arguments stored at integer
     * keys `1..n`, where `n` is the argument count stored in field `"n"`.
     */
    function pack(...args: LuaAny[]): LuaTable & { n: number };

    /**
     * Returns each element of `table` from index `i` to `j` as separate
     * values.
     * Defaults: `i = 1`, `j = #table`.
     */
    function unpack(table: LuaAny[], i?: number, j?: number): LuaAny[];

    /**
     * Returns a new table containing all keys of `table`.
     */
    function keys(table: LuaTable): LuaAny[];

    /**
     * Returns a new table containing all values of `table`.
     */
    function values(table: LuaTable): LuaAny[];

    /**
     * Sets every key in `table` to `nil`, effectively emptying it.
     */
    function clear(table: LuaTable): void;

    /**
     * Reinitialises `t1` with the elements of `t2`, replacing its
     * existing contents.
     */
    function initialize(t1: LuaTable, t2: LuaTable): void;

    /**
     * Creates and returns a new array-style table with `size` slots,
     * each pre-filled with `value` (defaults to `nil`).
     */
    function create(size: number, value?: LuaAny): LuaAny[];
}