import { join } from "node:path";
import { captureProcessOutput } from "../lib/process/capture.ts";

const cliEntrypoint = join(import.meta.dir, "..", "cli", "index.ts");

export function getTestCliCommand(): string[] {
	return [process.execPath, cliEntrypoint];
}

export async function runTestCli(
	args: string[],
	options: { cwd: string; env?: Record<string, string | undefined> },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const child = Bun.spawn([...getTestCliCommand(), ...args], {
		cwd: options.cwd,
		env: options.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return await captureProcessOutput(child);
}
