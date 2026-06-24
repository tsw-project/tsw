import path from "node:path";
import { findDeclarationFiles } from "./files.ts";
import { parseDeclarationFile } from "./parser.ts";
import { writeTsConfig } from "./tsconfig.ts";
import { writeDeclarations } from "./writer.ts";

export interface GenerateDeclarationOptions {
    workingDirectory: string;
}

export interface GenerateDeclarationResult {
    declarationCount: number;
    outputDirectory: string;
}

const nativeScriptsPath = path.join("Environment", "NativeScripts");

export async function generateDeclarations({
    workingDirectory,
}: GenerateDeclarationOptions): Promise<GenerateDeclarationResult> {
    const resolvedWorkingDirectory = path.resolve(workingDirectory);
    const sourceDirectory = path.join(
        resolvedWorkingDirectory,
        nativeScriptsPath,
    );
    const outputDirectory = path.join(resolvedWorkingDirectory, "Type");

    let sourceFiles: string[];
    try {
        sourceFiles = await findDeclarationFiles(sourceDirectory);
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
            throw new Error(
                `\nNativeScripts directory not found\n\n` +
                    `Make sure to enable "LocalWorkspace" and "UseExtendedScriptFormat" (Edit -> WorldConfig).\n`,
            );
        }
        throw error;
    }

    if (sourceFiles.length === 0) {
        throw new Error(`No .d.mlua files found in ${sourceDirectory}`);
    }

    const declarations = await Promise.all(
        sourceFiles.map(parseDeclarationFile),
    );

    await writeDeclarations(outputDirectory, declarations, sourceDirectory);
    await writeTsConfig(resolvedWorkingDirectory);

    return {
        declarationCount: declarations.length,
        outputDirectory,
    };
}
