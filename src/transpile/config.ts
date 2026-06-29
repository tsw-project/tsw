import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type MluaRegexReplacer = (entry: RegExpMatchArray) => string;
export type MluaRegexReplacement = readonly [RegExp, MluaRegexReplacer];

interface TswConfigModule {
    default?: unknown;
}

interface TswConfig {
    regex?: unknown;
    mluaRegex?: unknown;
}

export interface LoadedTswConfig {
    applyMluaRegex(code: string): string;
}

function asConfig(value: unknown): TswConfig {
    if (value === null || typeof value !== "object") return {};
    return value as TswConfig;
}

function normalizeRegexEntries(configPath: string, value: unknown) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new Error(`${configPath}: regex must be an array`);
    }

    return value.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw new Error(
                `${configPath}: regex[${index}] must be a [RegExp, replacer] pair`,
            );
        }

        const [regex, replacer] = entry;
        if (!(regex instanceof RegExp)) {
            throw new Error(`${configPath}: regex[${index}][0] must be a RegExp`);
        }
        if (typeof replacer !== "function") {
            throw new Error(
                `${configPath}: regex[${index}][1] must be a function`,
            );
        }

        return [regex, replacer] as MluaRegexReplacement;
    });
}

function applyRegexReplacement(
    code: string,
    [regex, replacer]: MluaRegexReplacement,
): string {
    regex.lastIndex = 0;
    const replaced = code.replace(regex, (...args: unknown[]) => {
        const groups =
            args.length > 0 && typeof args.at(-1) === "object"
                ? (args.pop() as Record<string, string>)
                : undefined;
        const input = args.pop();
        const index = args.pop();
        const match = args.shift();
        const captures = args;

        const entry = [match, ...captures] as RegExpMatchArray;
        entry.index = typeof index === "number" ? index : undefined;
        entry.input = typeof input === "string" ? input : undefined;
        if (groups !== undefined) entry.groups = groups;
        return replacer(entry);
    });
    regex.lastIndex = 0;
    return replaced;
}

async function importConfig(configPath: string): Promise<unknown> {
    const fileUrl = pathToFileURL(configPath);
    const stats = fs.statSync(configPath);
    const href = `${fileUrl.href}?mtime=${stats.mtimeMs}`;

    try {
        const module = (await import(href)) as TswConfigModule;
        return module.default ?? module;
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;

        const source = fs.readFileSync(configPath, "utf8");
        const dataUrl = new URL(
            `data:text/javascript;base64,${Buffer.from(source).toString(
                "base64",
            )}`,
        );
        dataUrl.hash = `tsw.config.js?mtime=${stats.mtimeMs}`;
        const module = (await import(dataUrl.href)) as TswConfigModule;
        return module.default ?? module;
    }
}

export async function loadTswConfig(
    workingDirectory: string,
): Promise<LoadedTswConfig> {
    const configPath = path.join(workingDirectory, "tsw.config.js");
    if (!fs.existsSync(configPath)) {
        return { applyMluaRegex: (code) => code };
    }

    const config = asConfig(await importConfig(configPath));
    const regexEntries = normalizeRegexEntries(
        configPath,
        config.regex ?? config.mluaRegex,
    );

    return {
        applyMluaRegex(code) {
            return regexEntries.reduce(applyRegexReplacement, code);
        },
    };
}
