declare namespace profiler {
    /**
     * Begins a user-defined profiling sample with the given `name`.
     * Must be paired with a corresponding call to `endscope`.
     */
    function beginscope(name: string): void;

    /**
     * Ends the most recently opened user-defined profiling sample.
     */
    function endscope(): void;
}