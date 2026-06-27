declare namespace math {
    /** The minimum representable integer value. */
    const mininteger: number;

    /** The maximum representable integer value. */
    const maxinteger: number;

    /** The value of π. */
    const pi: number;

    /** The largest representable float value (positive infinity). */
    const huge: number;

    /** Returns the smallest integer ≥ `x`. */
    function ceil(x: number): number;

    /** Returns the arccosine of `x` (in radians). */
    function acos(x: number): number;

    /** Converts angle `x` from radians to degrees. */
    function deg(x: number): number;

    /**
     * Returns e^x, where e ≈ 2.71828182845904 (base of the natural
     * logarithm).
     */
    function exp(x: number): number;

    /** Returns the square root of `x`. */
    function sqrt(x: number): number;

    /** Returns the sine of `x` (in radians). */
    function sin(x: number): number;

    /**
     * Returns `"integer"` if `x` is an integer, `"float"` if it is a
     * float, or `nil` if `x` is not a number.
     */
    function type(x: LuaAny): "integer" | "float" | null;

    /** Returns the tangent of `x` (in radians). */
    function tan(x: number): number;

    /** Returns the cosine of `x` (in radians). */
    function cos(x: number): number;

    /**
     * Sets `x` as the seed for the pseudo-random number generator.
     * Equal seeds produce equal sequences of numbers.
     */
    function randomseed(x: number): void;

    /** Returns a pseudo-random float uniformly distributed in [0, 1). */
    function random(): number;

    /** Returns a pseudo-random integer uniformly distributed in [1, n]. */
    function random(n: number): number;

    /**
     * Returns a pseudo-random integer uniformly distributed in [m, n].
     */
    function random(m: number, n: number): number;

    /**
     * Returns the argument with the minimum value according to the Lua
     * `<` operator.
     */
    function min(x: number, ...args: number[]): number;

    /** Returns the arcsine of `x` (in radians). */
    function asin(x: number): number;

    /** Converts angle `x` from degrees to radians. */
    function rad(x: number): number;

    /**
     * Returns the integral part and the fractional part of `x` as two
     * separate values.
     */
    function modf(x: number): [number, number];

    /**
     * Returns `true` if integer `m` is less than integer `n` when
     * compared as unsigned integers.
     */
    function ult(m: number, n: number): boolean;

    /**
     * Returns the argument with the maximum value according to the Lua
     * `<` operator.
     */
    function max(x: number, ...args: number[]): number;

    /**
     * Returns the logarithm of `x` in the given `base`.
     * Defaults to the natural logarithm (base e ≈ 2.7182818).
     */
    function log(x: number, base?: number): number;

    /**
     * Returns the remainder of `x / y`, rounding the quotient towards
     * zero.
     */
    function fmod(x: number, y: number): number;

    /** Returns the largest integer ≤ `x`. */
    function floor(x: number): number;

    /** Returns the absolute value of `x`. */
    function abs(x: number): number;

    /**
     * If `x` is representable as an integer, returns that integer.
     * Otherwise returns `nil`.
     */
    function tointeger(x: number): number | null;

    /**
     * Returns the arctangent of `y / x` (in radians), using the signs
     * of both arguments to determine the correct quadrant.
     * `x` defaults to `1`.
     */
    function atan(y: number, x?: number): number;

    /**
     * Returns `true` if the two floating-point values are approximately
     * equal (accounts for floating-point imprecision).
     */
    function almostequal(x: number, y: number): boolean;

    /** Returns the hyperbolic cosine of `x`. */
    function cosh(x: number): number;

    /** Returns the hyperbolic sine of `x`. */
    function sinh(x: number): number;

    /** Returns the hyperbolic tangent of `x`. */
    function tanh(x: number): number;

    /** Returns `x` raised to the power `y`. */
    function pow(x: number, y: number): number;

    /**
     * Returns `m` and `e` such that `x = m * 2^e`, where `e` is an
     * integer and |m| ∈ [0.5, 1) (or m = 0 when x = 0).
     */
    function frexp(x: number): [number, number];

    /** Returns `x * 2^e`. */
    function ldexp(x: number, e: number): number;

    /** Returns the base-10 logarithm of `x`. */
    function log10(x: number): number;

    /**
     * Clamps `value` to the range [min, max] and returns the result.
     */
    function clamp(value: number, min: number, max: number): number;

    /**
     * Returns an integer indicating the sign of `value`:
     * `-1`, `0`, or `1`.
     */
    function sign(value: number): number;
}