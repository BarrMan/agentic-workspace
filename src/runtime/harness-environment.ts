import { randomUUID } from "node:crypto";
import type { ProcessRunner } from "./session-process.ts";

const RESERVED_ENVIRONMENT = [
	"AGENTIC_WORKSPACE_PROJECT_DIR",
	"AGENTIC_WORKSPACE_WORKTREE_DIR",
	"AGENTIC_WORKSPACE_TASK_DIR",
] as const;
const PARENT_ENVIRONMENT = ["AGENTIC_WORKSPACE_CWD", "AGENTIC_WORKSPACE_TASK_ID"] as const;
const EXPANSION_TIMEOUT_MS = 2_000;
const STDOUT_LIMIT_BYTES = 1024 * 1024;
const STDERR_LIMIT_BYTES = 64 * 1024;

function delimiterFor(value: string): string {
	const lines = new Set(value.split("\n"));
	let delimiter: string;
	do {
		delimiter = `AGENTIC_WORKSPACE_ENV_${randomUUID().replaceAll("-", "")}`;
	} while (lines.has(delimiter));
	return delimiter;
}

function expansionScript(value: string): { script: string; marker: string } {
	const delimiter = delimiterFor(value);
	const marker = `AGENTIC_WORKSPACE_VALUE_${randomUUID().replaceAll("-", "")}`;
	return { script: `/bin/cat <<${delimiter}\n${value}:${marker}\n${delimiter}\n`, marker };
}

async function readBounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return new TextDecoder().decode(Buffer.concat(chunks));
			size += value.byteLength;
			if (size > limit) throw new Error("Environment expansion output exceeded its limit.");
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
}

function killProcessGroup(child: Bun.Subprocess): void {
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		try {
			child.kill("SIGKILL");
		} catch {
			// The child may have exited between detecting failure and cleanup.
		}
	}
}

async function runBoundedShell(script: string, cwd: string, env: Record<string, string>) {
	const child = Bun.spawn(["/bin/sh", "-c", script], {
		cwd,
		env,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		detached: true,
	});
	const output = Promise.all([
		readBounded(child.stdout, STDOUT_LIMIT_BYTES),
		readBounded(child.stderr, STDERR_LIMIT_BYTES),
		child.exited,
	]).then(([stdout, stderr, exitCode]) => ({ stdout, stderr, exitCode }));
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			output,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Environment expansion timed out.")), EXPANSION_TIMEOUT_MS);
			}),
		]);
	} catch (error) {
		killProcessGroup(child);
		await Promise.race([output.catch(() => undefined), Bun.sleep(100)]);
		throw error;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function runWithRunnerTimeout(runner: ProcessRunner, script: string, cwd: string, env: Record<string, string>) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			runner.run(["/bin/sh", "-c", script], { cwd, env, timeoutMs: EXPANSION_TIMEOUT_MS }),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Environment expansion timed out.")), EXPANSION_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function prepareHarnessEnvironment(
	presetEnv: Record<string, string>,
	paths: { projectDir: string; worktreeDir: string; taskDir: string },
	options: {
		runner?: ProcessRunner;
		inherited?: NodeJS.ProcessEnv;
		onWarning?: (text: string) => void;
	} = {},
): Promise<Record<string, string>> {
	const effective: Record<string, string> = {};
	for (const [name, value] of Object.entries(options.inherited ?? process.env)) {
		if (value !== undefined && !(PARENT_ENVIRONMENT as readonly string[]).includes(name)) effective[name] = value;
	}
	Object.assign(effective, {
		AGENTIC_WORKSPACE_PROJECT_DIR: paths.projectDir,
		AGENTIC_WORKSPACE_WORKTREE_DIR: paths.worktreeDir,
		AGENTIC_WORKSPACE_TASK_DIR: paths.taskDir,
	});

	for (const name of RESERVED_ENVIRONMENT) {
		if (Object.hasOwn(presetEnv, name))
			options.onWarning?.(`Ignoring preset override for reserved environment variable ${name}.`);
	}

	for (const [name, value] of Object.entries(presetEnv)) {
		if ((RESERVED_ENVIRONMENT as readonly string[]).includes(name)) continue;
		const previous = effective[name];
		try {
			const { script, marker } = expansionScript(value);
			const result = options.runner
				? await runWithRunnerTimeout(options.runner, script, paths.worktreeDir, effective)
				: await runBoundedShell(script, paths.worktreeDir, effective);
			if (
				new TextEncoder().encode(result.stdout).byteLength > STDOUT_LIMIT_BYTES ||
				new TextEncoder().encode(result.stderr).byteLength > STDERR_LIMIT_BYTES ||
				result.stdout.includes("\0")
			) {
				options.onWarning?.(`Could not expand preset environment variable ${name}; retaining its inherited value.`);
				if (previous === undefined) delete effective[name];
				else effective[name] = previous;
				continue;
			}
			if (result.exitCode !== 0 || ("timedOut" in result && result.timedOut)) {
				options.onWarning?.(`Could not expand preset environment variable ${name}; retaining its inherited value.`);
				if (previous === undefined) delete effective[name];
				else effective[name] = previous;
				continue;
			}
			const markerSuffix = `:${marker}\n`;
			if (!result.stdout.endsWith(markerSuffix)) throw new Error("Environment expansion marker was lost.");
			const expanded = result.stdout.slice(0, -markerSuffix.length);
			if (expanded.includes("\0")) throw new Error("Environment expansion contained a NUL byte.");
			effective[name] = expanded;
		} catch {
			options.onWarning?.(`Could not expand preset environment variable ${name}; retaining its inherited value.`);
			if (previous === undefined) delete effective[name];
			else effective[name] = previous;
		}
	}
	return effective;
}
