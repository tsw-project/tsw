declare namespace string {
    /**
     * Returns the uppercase form of `s`.
     */
    function upper(s: string): string;

    /**
     * Returns the lowercase form of `s`.
     */
    function lower(s: string): string;

    /**
     * Returns a copy of `s` where every occurrence of `pattern` has been
     * replaced with `repl`, plus the total number of substitutions made.
     * `n` caps the number of replacements.
     *
     * Note: indices and lengths are measured in bytes; exercise caution
     * with multi-byte (multi-language) content.
     */
    function gsub(s: string, pattern: string, repl: LuaAny, n: number): LuaMultiReturn<[string, number]>;

    /**
     * Returns a copy of `s` where every occurrence of `pattern` has been
     * replaced with `repl`, plus the total number of substitutions made.
     *
     * Note: indices and lengths are measured in bytes; exercise caution
     * with multi-byte (multi-language) content.
     */
    function gsub(s: string, pattern: string, repl: LuaAny): LuaMultiReturn<[string, number]>;

    /**
     * Looks for the first match of `pattern` in `s` starting at byte
     * position `init`.
     * - On success: returns the start and end byte indices of the match.
     * - On failure: returns `nil`.
     *
     * Set `plain` to `true` to perform a literal (non-pattern) search.
     *
     * Note: indices and lengths are measured in bytes.
     */
    function find(
        s: string,
        pattern: string,
        init?: number,
        plain?: boolean
    ): LuaMultiReturn<[number, number]> | null;

    /**
     * Returns `s` with its characters in reverse order.
     */
    function reverse(s: string): string;

    /**
     * Returns a formatted string, following `fmt` (similar to C's
     * `sprintf`).
     */
    function format(fmt: string, ...args: LuaAny[]): string;

    /**
     * Generates the string whose characters correspond to the given
     * integer character codes.
     */
    function char(...args: number[]): string;

    /**
     * Returns the numeric byte codes of characters in `s` between byte
     * positions `i` and `j`.
     *
     * Note: indices and lengths are measured in bytes.
     */
    function byte(s: string, i?: number, j?: number): number[];

    /**
     * Returns the byte length of `s`.
     *
     * Note: indices and lengths are measured in bytes.
     */
    function len(s: string): number;

    /**
     * Returns a string consisting of `n` copies of `s` concatenated with
     * `sep` as the separator.
     */
    function rep(s: string, n: number, sep?: string): string;

    /**
     * Returns an iterator function that, on each successive call, returns
     * the next match of `pattern` in `s`.
     *
     * Note: indices and lengths are measured in bytes.
     */
    function gmatch(s: string, pattern: string): LuaFunc;

    /**
     * Returns the first match of `pattern` in `s`, starting the search
     * at byte position `init`.
     */
    function match(s: string, pattern: string, init?: number): string | null;

    /**
     * Returns a binary string packed according to the format string
     * `fmt`.
     */
    function pack(fmt: string, ...args: LuaAny[]): string;

    /**
     * Returns the size (in bytes) of the binary string that
     * `string.pack` with format `fmt` would produce.
     * Variable-length (`s`) and NUL-terminated (`z`) format options
     * cannot be used.
     */
    function packsize(fmt: string): number;

    /**
     * Returns the substring of `s` from byte position `i` to `j`
     * (inclusive). Negative indices count from the end.
     */
    function sub(s: string, i: number, j?: number): string;

    /**
     * Unpacks values from the binary string `s` according to format `fmt`,
     * starting at byte position `pos`.
     *
     * Note: indices and lengths are measured in bytes.
     */
    function unpack(fmt: string, s: string, pos?: number): LuaMultiReturn<[...LuaAny]>;

    /**
     * Compares `s1` and `s2` lexicographically.
     * - Returns `0`  if they are equal.
     * - Returns `< 0` if `s1` comes first.
     * - Returns `> 0` if `s2` comes first.
     */
    function compare(s1: string, s2: string): number;

    /**
     * Returns `true` if `s1` and `s2` are identical.
     */
    function equals(s1: string, s2: string): boolean;
}

interface String {
    /** Returns the uppercase form of this string. */
    upper(): string;

    /** Returns the lowercase form of this string. */
    lower(): string;

    /**
     * Returns a copy of this string where every occurrence of `pattern`
     * has been replaced with `repl`, plus the total number of
     * substitutions. `n` caps the replacement count.
     *
     * Note: indices and lengths are measured in bytes.
     */
    gsub(pattern: string, repl: LuaAny, n: number): LuaMultiReturn<[string, number]>;

    /**
     * Returns a copy of this string where every occurrence of `pattern`
     * has been replaced with `repl`, plus the total number of
     * substitutions.
     *
     * Note: indices and lengths are measured in bytes.
     */
    gsub(pattern: string, repl: LuaAny): LuaMultiReturn<[string, number]>;

    /**
     * Looks for the first match of `pattern` starting at byte position
     * `init`. Set `plain` to `true` for a literal search.
     * Returns start and end byte indices on success, or `nil` on failure.
     *
     * Note: indices and lengths are measured in bytes.
     */
    find(pattern: string, init?: number, plain?: boolean): LuaMultiReturn<[number, number]> | null;

    /** Returns this string with its characters in reverse order. */
    reverse(): string;

    /** Returns a formatted string (similar to C's `sprintf`). */
    format(...args: LuaAny[]): string;

    /**
     * Returns the numeric byte codes of this string's characters between
     * positions `i` and `j`.
     *
     * Note: indices and lengths are measured in bytes.
     */
    byte(i?: number, j?: number): number[];

    /**
     * Returns the byte length of this string.
     *
     * Note: indices and lengths are measured in bytes.
     */
    len(): number;

    /**
     * Returns this string repeated `n` times, joined by `sep`.
     */
    rep(n: number, sep?: string): string;

    /**
     * Returns an iterator that yields the next match of `pattern` on
     * each call.
     *
     * Note: indices and lengths are measured in bytes.
     */
    gmatch(pattern: string): LuaFunc;

    /**
     * Returns the first match of `pattern` in this string, beginning
     * the search at byte position `init`.
     */
    match(pattern: string, init?: number): string | null;

    /**
     * Returns a binary string packed according to the format string.
     */
    pack(...args: LuaAny[]): string;

    /**
     * Returns the byte size of the packed result for this format string.
     * Variable-length (`s`) and `z` options cannot be used.
     */
    packsize(): number;

    /**
     * Returns the substring from byte position `i` to `j`. Negative
     * indices count from the end.
     */
    sub(i: number, j?: number): string;

    /**
     * Unpacks values from this binary string according to the format
     * string, starting at `pos`.
     *
     * Note: indices and lengths are measured in bytes.
     */
    unpack(s: string, pos?: number): LuaMultiReturn<[...LuaAny]>;

    /**
     * Lexicographically compares this string with `s`.
     * Returns `0` if equal, a negative number if this string comes
     * first, or a positive number if `s` comes first.
     */
    compare(s: string): number;

    /**
     * Returns `true` if this string and `s` are identical.
     */
    equals(s: string): boolean;
}