import fs from "node:fs";
import path from "node:path";
import { generateContentId } from "./content-id.ts";

export type ScriptType = "Logic" | "Component" | "Event" | "Struct" | "ActionNode" | "DecoratorNode";

const CODEBLOCK_TYPE: Record<ScriptType, number> = {
    Component: 1,
    Event: 2,
    Logic: 5,
    Struct: 9,
    ActionNode: 7,
    DecoratorNode: 7,
};

const CODEBLOCK_TARGET: Partial<Record<ScriptType, string>> = {
    ActionNode: "MOD.Core.BTNodes.ActionNode",
    DecoratorNode: "MOD.Core.BTNodes.DecoratorNode",
};

function makeDirectory(name: string): object {
    const id = `directory://${generateContentId(`__tsw_directory://${name}`)}`;
    return {
        Id: "",
        GameId: "",
        EntryKey: id,
        ContentType: "x-mod/directory",
        Content: "",
        Usage: 0,
        UsePublish: 1,
        UseService: 0,
        CoreVersion: "26.5.0.0",
        StudioVersion: "0.1.0.0",
        DynamicLoading: 0,
        ContentProto: {
            Use: "Json",
            Json: {
                entry_id: id,
                name,
                lock: false,
                folding: false,
                nameEditable: false,
            },
        },
    };
}

function makeCodeblock(name: string, scriptType: ScriptType): object {
    const id = generateContentId(`__tsw_codeblock://${name}`);
    return {
        Id: "",
        GameId: "",
        EntryKey: `codeblock://${id}`,
        ContentType: "x-mod/codeblock",
        Content: "",
        Usage: 0,
        UsePublish: 1,
        UseService: 0,
        CoreVersion: "26.5.0.0",
        StudioVersion: "0.1.0.0",
        DynamicLoading: 0,
        ContentProto: {
            Use: "Json",
            Json: {
                CoreVersion: { Major: 0, Minor: 2 },
                ScriptVersion: { Major: 1, Minor: 1 },
                Description: "",
                Id: id,
                Language: 1,
                Name: name,
                Type: CODEBLOCK_TYPE[scriptType],
                Source: 0,
                Target: CODEBLOCK_TARGET[scriptType] ?? null,
            },
        },
    };
}

/** Ensures all directories on the path exist and each has a .directory sidecar. */
export function ensureOutputDirectory(rootPath: string, dirPath: string): void {
    const rel = path.relative(rootPath, dirPath);
    const segments = rel.split(path.sep).filter((s) => s.length > 0);
    let current = rootPath;
    for (const segment of segments) {
        current = path.join(current, segment);
        if (!fs.existsSync(current)) {
            fs.mkdirSync(current);
        }
        const sidecar = path.join(
            path.dirname(current),
            `${segment}.directory`,
        );
        if (!fs.existsSync(sidecar)) {
            fs.writeFileSync(
                sidecar,
                JSON.stringify(makeDirectory(segment), null, 4),
            );
        }
    }
}

export function writeCodeblock(
    filePath: string,
    name: string,
    scriptType: ScriptType,
): void {
    fs.writeFileSync(
        filePath,
        JSON.stringify(makeCodeblock(name, scriptType), null, 4),
    );
}
