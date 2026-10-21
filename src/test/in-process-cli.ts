import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";

export type CliResult = { exitCode: number; stdout: string; stderr: string };

let queue = Promise.resolve();

/** Runs an in-process CLI command while serializing its process-global mutations. */
export function runInProcessCli(args: string[], options: { cwd?: string } = {}): Promise<CliResult> {
	const invocation = queue.then(async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const out = new Writable({
			write: (chunk, _encoding, done) => {
				stdout.push(chunk.toString());
				done();
			},
		});
		const err = new Writable({
			write: (chunk, _encoding, done) => {
				stderr.push(chunk.toString());
				done();
			},
		});
		const exitCode = await runCli(args, { cwd: options.cwd, stdout: out, stderr: err });
		return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
	});
	queue = invocation.then(
		() => undefined,
		() => undefined,
	);
	return invocation;
}
