import type { Writable } from "node:stream";
import { findAgenticWorkspaceRoot } from "../utils/find-agentic-workspace-root.ts";
import { resolveRuntimeCwd } from "../utils/runtime-cwd.ts";

/** Startup capabilities shared by command registrations without exposing process-wide state. */
export class CliRuntime {
	readonly hasInteractiveTTY: boolean;

	constructor(
		private readonly cwdOverride?: string,
		stdout: Pick<Writable, "write"> & { isTTY?: boolean } = process.stdout,
	) {
		this.hasInteractiveTTY = Boolean(stdout.isTTY && process.stdin.isTTY);
	}

	async cwd(override?: string): Promise<string> {
		try {
			return (await resolveRuntimeCwd(override || this.cwdOverride ? { cwd: override ?? this.cwdOverride } : undefined))
				.cwd;
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
		}
	}

	async findProjectRoot(override?: string): Promise<string | null> {
		return findAgenticWorkspaceRoot(await this.cwd(override));
	}

	async projectRoot(): Promise<string> {
		const root = await this.findProjectRoot();
		if (root) return root;
		console.error("No AgenticWorkspace project found. Run `agentic-workspace init` to initialize.");
		throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
	}
}
