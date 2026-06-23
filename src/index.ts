import { Command, Option } from "commander";
import { generateDeclarations } from "./declarations";
import { build } from "./transpile";

function addWorkingDirectoryOptions(cmd: Command): Command {
    return cmd
        .addOption(
            new Option(
                "-C, --cwd <world-directory>",
                "World/project directory.",
            ).default(process.cwd(), "current working directory"),
        )
}

function resolveWorkingDirectory(opts: { cwd: string; workingDirectory?: string }): string {
    return opts.workingDirectory ?? opts.cwd;
}

async function main() {
    const program = new Command()
        .name("tsw")
        .description("MapleStory Worlds TypeScript toolchain.")
        .showHelpAfterError();

    const declarationsCmd = program
        .command("declarations")
        .description("Generate TypeScript declarations from .d.mlua native scripts.");
    addWorkingDirectoryOptions(declarationsCmd);
    declarationsCmd.action(async () => {
        const opts = declarationsCmd.optsWithGlobals<{ cwd: string; workingDirectory?: string }>();
        const result = await generateDeclarations({
            workingDirectory: resolveWorkingDirectory(opts),
        });
        console.log(
            `Generated ${result.declarationCount} TypeScript declaration files in ${result.outputDirectory}`,
        );
    });

    const buildCmd = program
        .command("build")
        .description("Compile TypeScript sources to .mlua scripts.");
    addWorkingDirectoryOptions(buildCmd);
    buildCmd.action(async () => {
        const opts = buildCmd.optsWithGlobals<{ cwd: string; workingDirectory?: string }>();
        const result = await build({
            workingDirectory: resolveWorkingDirectory(opts),
        });
        if (result.emitSkipped) {
            console.log("Build complete (no files emitted).");
        } else {
            console.log(`Build complete in ${result.outputDirectory}`);
        }
    });

    // Legacy default: no subcommand runs declarations
    program.action(async () => {
        const opts = program.opts<{ cwd: string; workingDirectory?: string }>();
        const result = await generateDeclarations({
            workingDirectory: resolveWorkingDirectory(opts),
        });
        console.log(
            `Generated ${result.declarationCount} TypeScript declaration files in ${result.outputDirectory}`,
        );
    });

    addWorkingDirectoryOptions(program);

    await program.parseAsync();
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
