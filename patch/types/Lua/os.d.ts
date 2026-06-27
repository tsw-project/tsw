declare namespace os {
    /**
     * Returns a string or table describing the date/time according to
     * `format`, derived from the given `time` timestamp.
     *
     * Format directives follow the C `strftime` convention.
     * Prefix the format with `"*t"` to receive a table instead of a
     * string.
     */
    function date(format: string, time: number): LuaAny;

    /**
     * Returns a string or table describing the current date/time
     * according to `format`.
     */
    function date(format: string): LuaAny;

    /**
     * Returns a string containing the current date and time using a
     * default format.
     */
    function date(): LuaAny;

    /**
     * Returns an approximation of the CPU time (in seconds) consumed by
     * the program.
     */
    function clock(): number;

    /**
     * Converts a time table to a timestamp (seconds since the epoch).
     * The table must contain `year`, `month`, and `day` fields, and may
     * also contain `hour`, `min`, `sec`, and `isdst`.
     */
    function time(table: LuaTable): number;

    /** Returns the current time as a timestamp (seconds since the epoch). */
    function time(): number;

    /**
     * Returns the difference in seconds from time `t1` to time `t2`
     * (`t2 - t1`).
     */
    function difftime(t2: number, t1: number): number;
}