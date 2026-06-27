import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MemberPatch } from "./patcher.ts";

const patchDir = fileURLToPath(new URL("../../patch", import.meta.url));

export const IDENTIFIER_RENAMES: Record<string, string> = JSON.parse(
    readFileSync(`${patchDir}/rules/identifier-map.json`, "utf8"),
);

export const PATCHES: Record<string, MemberPatch | MemberPatch[]> = JSON.parse(
    readFileSync(`${patchDir}/rules/type-map.json`, "utf8"),
);

export const IMMEDIATE_INIT_TYPES: Set<string> = new Set(
    JSON.parse(readFileSync(`${patchDir}/rules/init-types.json`, "utf8")),
);

export const PASSTHROUGH_TYPES: Set<string> = new Set(
    JSON.parse(
        readFileSync(`${patchDir}/rules/passthrough-types.json`, "utf8"),
    ),
);
