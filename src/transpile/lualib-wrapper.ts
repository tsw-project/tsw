import fs from "node:fs";
import path from "node:path";
import { writeCodeblock } from "./msw-files";

const BUNDLE_NAME = "lualib_bundle";
export const LUALIB_SCRIPT_NAME = "LuaLib";
const LOAD_METHOD = "lualib_bundle_Load";

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
 *   - LuaLib.mlua     — a Logic script with a single lualib_bundle_Load method
 *                       that inlines the bundle body and promotes all exports to _G
 *   - LuaLib.codeblock — the MSW metadata sidecar
 */
export function writeLualibBundleScript(outDir: string, extraLuaChunks: string[] = []): void {
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

    const indentedExtras = extraLuaChunks
        .map((chunk) =>
            chunk
                .split("\n")
                .map((line) => (line.trim() ? `\t\t${line}` : ""))
                .join("\n"),
        )
        .join("\n\n");

    const mlua = [
        `@Logic`,
        `script ${LUALIB_SCRIPT_NAME} extends Logic`,
        ``,
        `\tmethod void ${LOAD_METHOD}()`,
        `\t\tif _G["__lualib_loaded"] then return end`,
        `\t\t_G["__lualib_loaded"] = true`,
        indentedBody,
        globalAssignments,
        ...(indentedExtras ? [indentedExtras] : []),
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
