import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ListRootsResultSchema, type ServerNotification, type ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Core } from "../core/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { findAgenticWorkspaceRoot } from "../utils/find-agentic-workspace-root.ts";

type ServerRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
type RootActivationOptions = { debug?: boolean; startupConfig: AgenticWorkspaceConfig | null };

/** Owns project-root transitions requested by the optional MCP roots protocol. */
export class McpRootActivation {
	private enabled = false;
	private dirty = false;
	private inFlight?: Promise<void>;
	private debug = false;
	private startupConfig: AgenticWorkspaceConfig | null = null;

	constructor(
		private readonly getApplication: () => Core,
		private readonly createApplication: (projectRoot: string) => Core,
		private readonly replaceApplication: (application: Core) => void,
		private readonly initialProjectRoot: string,
		private readonly setCapabilities: (config: AgenticWorkspaceConfig | null, projectRoot: string) => Promise<void>,
		private readonly log: (message: string, options?: { debug?: boolean }) => void,
	) {}

	enable(options: RootActivationOptions): void {
		this.enabled = true;
		this.debug = options.debug ?? false;
		this.startupConfig = options.startupConfig;
		this.dirty = true;
	}

	markDirty(): void {
		if (this.enabled) this.dirty = true;
	}

	async ensure(extra: ServerRequestExtra | undefined, supportsRoots: boolean): Promise<void> {
		if (!this.enabled || !this.dirty || !extra) return;
		if (!this.inFlight) {
			const resolution = this.resolve(extra, supportsRoots).finally(() => {
				if (this.inFlight === resolution) this.inFlight = undefined;
			});
			this.inFlight = resolution;
		}
		await this.inFlight;
	}

	private async resolve(extra: ServerRequestExtra, supportsRoots: boolean): Promise<void> {
		this.dirty = false;
		if (!supportsRoots) {
			this.log("Client does not support MCP roots capability, staying in current mode.", { debug: this.debug });
			return;
		}
		try {
			const { roots } = await extra.sendRequest({ method: "roots/list" }, ListRootsResultSchema);
			this.log(`Received ${roots.length} root(s) from client.`, { debug: this.debug });
			for (const root of roots) {
				const rootPath = await resolveRootSearchPath(root.uri);
				if (!rootPath) continue;
				const resolved = (await findAgenticWorkspaceRoot(rootPath)) ?? rootPath;
				if (await this.activate(resolved)) return;
			}
			await this.restoreStartupMode();
		} catch (error) {
			this.log(`Roots discovery failed: ${error instanceof Error ? error.message : String(error)}`, {
				debug: this.debug,
			});
		}
	}

	private async activate(projectRoot: string): Promise<boolean> {
		const application = this.createApplication(projectRoot);
		try {
			await application.ensureConfigLoaded();
			const config = await application.filesystem.loadConfig();
			if (!config) throw new Error("no valid config");
			const current = this.getApplication().filesystem;
			if (
				current.rootDir === application.filesystem.rootDir &&
				current.agenticWorkspaceDir === application.filesystem.agenticWorkspaceDir &&
				current.configFilePath === application.filesystem.configFilePath
			)
				return true;
			this.replaceApplication(application);
			await this.setCapabilities(config, projectRoot);
			this.log(`MCP server activated project: ${projectRoot}`, { debug: this.debug });
			return true;
		} catch (error) {
			this.log(`Skipping root ${projectRoot}: ${error instanceof Error ? error.message : String(error)}`, {
				debug: this.debug,
			});
			return false;
		}
	}

	private async restoreStartupMode(): Promise<void> {
		if (this.getApplication().filesystem.rootDir === this.initialProjectRoot) return;
		this.replaceApplication(this.createApplication(this.initialProjectRoot));
		await this.setCapabilities(this.startupConfig, this.initialProjectRoot);
		this.log("MCP server restored its launch-directory mode.", { debug: this.debug });
	}
}

async function resolveRootSearchPath(rootUri: string): Promise<string | null> {
	if (!rootUri.startsWith("file://")) return null;
	try {
		const rootPath = fileURLToPath(rootUri);
		const rootStat = await stat(rootPath);
		if (rootStat.isDirectory()) return rootPath;
		if (rootStat.isFile()) return dirname(rootPath);
	} catch {
		return null;
	}
	return null;
}
