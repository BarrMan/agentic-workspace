import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import type { Core } from "../index.ts";

export interface TaskArtifactCommandRuntime {
	createCore: () => Promise<Core>;
}

function printJson(value: unknown): void {
	console.log(JSON.stringify(value, null, 2));
}

function wantsJson(command: Command): boolean {
	return Boolean(command.optsWithGlobals().json);
}

/** Register generic task artifact list, read, and write commands on the task command. */
export function registerTaskArtifactCommands(taskCommand: Command, runtime: TaskArtifactCommandRuntime): void {
	const artifact = taskCommand.command("artifact").description("manage task artifacts");
	const listCommand = artifact
		.command("list <taskId>")
		.option("--json", "output JSON")
		.option("--plain", "output plain text")
		.action(async (taskId: string) => {
			try {
				const entries = await (await runtime.createCore()).storage.taskArtifacts.list(taskId);
				if (wantsJson(listCommand)) return printJson({ artifacts: entries });
				if (entries.length === 0) return void console.log("No artifacts.");
				for (const entry of entries) console.log(`${entry.type}\t${entry.size}\t${entry.path}`);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
		});
	const readCommand = artifact
		.command("read <taskId> <path>")
		.option("--json", "output JSON with base64 content")
		.action(async (taskId: string, path: string) => {
			try {
				const bytes = await (await runtime.createCore()).storage.taskArtifacts.read(taskId, path);
				if (wantsJson(readCommand)) return printJson({ contentBase64: Buffer.from(bytes).toString("base64") });
				process.stdout.write(bytes);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
		});
	const writeCommand = artifact
		.command("write <taskId> <path>")
		.option("--json", "output JSON")
		.option("--from <file>", "read artifact bytes from a file; defaults to stdin")
		.action(async (taskId: string, path: string, options: { from?: string }) => {
			try {
				const bytes = options.from
					? await readFile(options.from)
					: Buffer.from(await new Response(Bun.stdin.stream()).arrayBuffer());
				await (await runtime.createCore()).storage.taskArtifacts.write(taskId, path, bytes);
				if (wantsJson(writeCommand)) return printJson({ path });
				console.log(`Written\t${path}`);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
		});
}
