import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScriptDeclaration } from "./ast.ts";
import { applyPatches } from "./patcher.ts";
import { SUPPORT } from "./patches.ts";
import {
    renderDeclaration,
    renderIndexDeclaration,
    renderSupportDeclaration,
} from "./render.ts";

export async function writeDeclarations(
    outputDirectory: string,
    declarations: ScriptDeclaration[],
    sourceDirectory: string,
) {
    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    const references: string[] = ["support.d.ts"];
    await writeFile(
        path.join(outputDirectory, "support.d.ts"),
        renderSupportDeclaration(SUPPORT),
        "utf8",
    );

    applyPatches(declarations);

    for (const declaration of declarations) {
        const relativeSource = path.relative(
            sourceDirectory,
            declaration.sourcePath,
        );
        const relativeOutput = relativeSource.replace(/\.d\.mlua$/, ".d.ts");
        const outputPath = path.join(outputDirectory, relativeOutput);

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, renderDeclaration(declaration), "utf8");
        references.push(relativeOutput.replaceAll(path.sep, "/"));
    }

    await writeFile(
        path.join(outputDirectory, "index.d.ts"),
        renderIndexDeclaration(references),
        "utf8",
    );
}
