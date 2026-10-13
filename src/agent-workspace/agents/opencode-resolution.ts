import type { AgentPreset } from "../types.ts";
import { commandArguments } from "./profile.ts";

const VERSION_TIMEOUT_MS = 2_000;

/** Resolve the public OpenCode preset against the executable used for this execution. */
export async function resolveLaunchPreset(
	preset: AgentPreset,
	options: { cwd: string; env: Record<string, string> },
): Promise<AgentPreset> {
	if (preset.bootstrap !== "opencode") return structuredClone(preset);
	let command: string[];
	try {
		command = commandArguments(preset.command);
	} catch {
		throw new Error("Could not determine the OpenCode version from the configured command.");
	}
	if (command.length === 0) throw new Error("Could not determine the OpenCode version from an empty command.");
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn([...command, "--version"], {
			cwd: options.cwd,
			env: options.env,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		});
	} catch {
		throw new Error("Could not start the configured OpenCode command to determine its version.");
	}
	const timeout = setTimeout(() => child.kill("SIGKILL"), VERSION_TIMEOUT_MS);
	try {
		const [exitCode, output] = await Promise.all([
			child.exited,
			new Response(child.stdout as ReadableStream<Uint8Array>).text(),
		]);
		const version = output.trim();
		if (exitCode !== 0) throw new Error(`Could not determine the OpenCode version (exit ${exitCode}).`);
		if (/^(?:opencode )?1\.19\.0$/.test(version)) return { ...structuredClone(preset), bootstrap: "opencode-v1" };
		if (/^(?:opencode )?v2\.\d+\.\d+$/.test(version)) {
			return { ...structuredClone(preset), bootstrap: "opencode-v2" };
		}
		throw new Error(`Unsupported OpenCode version ${JSON.stringify(version)}; expected 1.19.0 or version 2.`);
	} finally {
		clearTimeout(timeout);
		await child.exited;
	}
}
