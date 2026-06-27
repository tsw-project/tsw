import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeCodeblock } from "./msw-files.ts";

const BUNDLE_NAME = "lualib_bundle";
export const LUALIB_SCRIPT_NAME = "LuaLib";
export const LUALIB_LOAD_METHOD = "LoadLuaLib";
const require = createRequire(import.meta.url);

/** Extra Lua chunks appended inside LoadLuaLib() after the stdlib globals are set up. */
export const LUA_EXTRA: string[] = [];

const _luaExtraDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../patch/lua",
);
if (fs.existsSync(_luaExtraDir)) {
    for (const file of fs.readdirSync(_luaExtraDir).sort()) {
        if (file.endsWith(".lua")) {
            LUA_EXTRA.push(fs.readFileSync(path.join(_luaExtraDir, file), "utf8"));
        }
    }
}

/**
 * Parses the exported names from the `return { key = value, ... }` table at
 * the end of a TSTL lualib_bundle.lua file.
 */
function parseExportedNames(bundleSource: string): string[] {
    const returnIdx = bundleSource.lastIndexOf("\nreturn {");
    if (returnIdx === -1) return [];
    const tableStr = bundleSource.slice(returnIdx);
    const names: string[] = [];
    for (const line of tableStr.split("\n")) {
        const m = line.match(/^\s+(\w+)\s*=/);
        if (m?.[1]) names.push(m[1]);
    }
    return names;
}

/**
 * Reads lualib_bundle.lua emitted by TSTL into outDir and writes:
 *   - LuaLib.mlua     — a Logic script with a single LoadLuaLib method
 *                       that inlines the bundle body and promotes all exports to _G
 *   - LuaLib.codeblock — the MSW metadata sidecar
 */
export function writeLualibBundleScript(outDir: string): void {
    const bundleLuaPath = require.resolve(
        `typescript-to-lua/dist/lualib/universal/${BUNDLE_NAME}.lua`,
    );

    const source = fs.readFileSync(bundleLuaPath, "utf8");
    const exportedNames = parseExportedNames(source);

    // Strip the trailing `return { ... }` block; replace with _G assignments
    const returnIdx = source.lastIndexOf("\nreturn {");
    const bundleBody = returnIdx !== -1 ? source.slice(0, returnIdx) : source;

    const indentedBody = bundleBody
        .split("\n")
        .map((line) => (line.trim() ? `\t\t${line}` : ""))
        .join("\n");

    const globalAssignments = exportedNames
        .map((n) => `\t\t_G["${n}"] = ${n}`)
        .join("\n");

    const extraBody = LUA_EXTRA.map((chunk) =>
        chunk
            .split("\n")
            .map((line) => (line.length > 0 ? `\t\t${line}` : ""))
            .join("\n"),
    ).join("\n");

    const mlua = [
        `@Logic`,
        `script ${LUALIB_SCRIPT_NAME} extends Logic`,
        ``,
        `\tmethod void ${LUALIB_LOAD_METHOD}()`,
        `\t\tif _G["__lualib_loaded"] then return end`,
        `\t\t_G["__lualib_loaded"] = true`,
        indentedBody,
        globalAssignments,
        ...(extraBody ? [extraBody] : []),
        `\tend`,
        ``,
        `end`,
    ].join("\n");

    fs.writeFileSync(path.join(outDir, `${LUALIB_SCRIPT_NAME}.mlua`), mlua);
    writeCodeblock(
        path.join(outDir, `${LUALIB_SCRIPT_NAME}.codeblock`),
        LUALIB_SCRIPT_NAME,
        "Logic",
    );
}
