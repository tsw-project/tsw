import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScriptDeclaration } from "./ast.ts";
import { applyPatches } from "./patcher.ts";
import { renderDeclaration, renderIndexDeclaration } from "./render.ts";

const patchTypesDir = fileURLToPath(
    new URL("../../patch/types", import.meta.url),
);

export async function writeDeclarations(
    outputDirectory: string,
    declarations: ScriptDeclaration[],
    sourceDirectory: string,
) {
    await rm(outputDirectory, { force: true, recursive: true });
    await mkdir(outputDirectory, { recursive: true });

    const patchTypeFiles = (
        await readdir(patchTypesDir, { recursive: true })
    ).filter((f) => (f as string).endsWith(".d.ts")) as string[];

    const references: string[] = [];
    for (const file of patchTypeFiles) {
        const content = await readFile(path.join(patchTypesDir, file), "utf8");
        const outPath = path.join(outputDirectory, file);
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, content, "utf8");
        references.push(file.replaceAll(path.sep, "/"));
    }

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
