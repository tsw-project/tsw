declare namespace utf8 {
    /**
     * Pattern that matches exactly one UTF-8 byte sequence.
     * Value: `"[\0-\x7F\xC2-\xF4][\x80-\xBF]*"`.
     */
    const charpattern: string;

    /**
     * Returns the Unicode code points of all characters in `s` whose
     * byte positions fall between `i` and `j`.
     * Defaults: `i = 1`, `j = i`.
     */
    function codepoint(s: string, i?: number, j?: number): number[];

    /**
     * Returns an iterator triple `(iter, s, 0)` that, on each call,
     * yields the byte position and code point of the next UTF-8
     * character in `s`. Raises an error on encountering an invalid byte
     * sequence.
     */
    function codes(s: string): [LuaFunc, string, number];

    /**
     * Returns the byte position in `s` where the `n`-th UTF-8 character
     * begins. Negative `n` counts from the end.
     * `i` is the byte offset at which to start counting (default `1`).
     */
    function offset(s: string, n: number, i?: number): number;

    /**
     * Converts each integer code point to its UTF-8 byte sequence and
     * returns the concatenated result as a string.
     */
    function char(...args: number[]): string;

    /**
     * Returns the number of UTF-8 characters in `s` between byte
     * positions `i` and `j`.
     * On encountering an invalid byte sequence, returns `false` plus the
     * position of the first invalid byte.
     *
     * Defaults: `i = 1`, `j = -1`.
     */
    function len(s: string, i?: number, j?: number): number | [false, number];
}