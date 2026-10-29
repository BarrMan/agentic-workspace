import type { Writable } from "node:stream";
import { findAgenticWorkspaceRoot } from "../filesystem/paths/find-root.ts";
import { createApplication } from "../index.ts";
import { resolveRuntimeCwd } from "../lib/runtime-cwd.ts";

/** Startup capabilities shared by command registrations without exposing process-wide state. */
export class CliRuntime {
	readonly hasInteractiveTTY: boolean;
	private readonly applications = new Set<Awaited<ReturnType<typeof createApplication>>>();

	async application() {
		const application = await createApplication(await this.projectRoot());
		this.applications.add(application);
		return application;
	}

	dispose(): void {
		for (const { core } of this.applications) core.tasks.dispose();
		this.applications.clear();
	}

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
		console.error("No AgenticWorkspace project found in this directory.");
		throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
	}
}
