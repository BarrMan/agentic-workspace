/**
 * MCP Command Group - Model Context Protocol CLI commands.
 *
 * This simplified command set focuses on the stdio transport, which is the
 * only supported transport for AgenticWorkspace's local MCP integration.
 */

import type { Command } from "commander";
import { isConfigValueError } from "../file-system/operations.ts";
import { createMcpServer } from "../mcp/server.ts";
import { findAgenticWorkspaceRoot } from "../utils/find-agentic-workspace-root.ts";
import { resolveRuntimeCwd } from "../utils/runtime-cwd.ts";

type StartOptions = {
	debug?: boolean;
	cwd?: string;
};

type StoppableMcpServer = {
	stop(): Promise<void>;
};

function registerShutdownHandlers(server: StoppableMcpServer, debug: boolean): void {
	let shutdownTriggered = false;
	let shutdownExitCode = 0;
	const shutdown = async (signal: string): Promise<number> => {
		if (shutdownTriggered) return shutdownExitCode;
		shutdownTriggered = true;
		if (debug) console.error(`Received ${signal}, shutting down MCP server...`);
		try {
			await server.stop();
			return shutdownExitCode;
		} catch (error) {
			console.error("Error during MCP server shutdown:", error);
			shutdownExitCode = 1;
			return shutdownExitCode;
		}
	};
	const handleShutdown = (signal: string) => {
		void shutdown(signal).then((exitCode) => {
			process.exitCode = exitCode;
		});
	};
	const handleStdioClose = () => handleShutdown("stdio");
	process.stdin.once("end", handleStdioClose);
	if (process.platform !== "win32") process.stdin.once("close", handleStdioClose);
	const handlePipeError = (error: unknown) => {
		const code =
			error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
		if (code === "EPIPE") handleShutdown("EPIPE");
	};
	process.stdout.once("error", handlePipeError);
	process.stderr.once("error", handlePipeError);
	process.once("SIGINT", () => handleShutdown("SIGINT"));
	process.once("SIGTERM", () => handleShutdown("SIGTERM"));
	if (process.platform !== "win32") {
		process.once("SIGHUP", () => handleShutdown("SIGHUP"));
		process.once("SIGPIPE", () => handleShutdown("SIGPIPE"));
	}
}

/**
 * Register MCP command group with CLI program.
 *
 * @param program - Commander program instance
 */
export function registerMcpCommand(program: Command): void {
	const mcpCmd = program.command("mcp");
	registerStartCommand(mcpCmd);
}

/**
 * Register 'mcp start' command for stdio transport.
 */
function registerStartCommand(mcpCmd: Command): void {
	mcpCmd
		.command("start")
		.description("Start the MCP server using stdio transport")
		.option("-d, --debug", "Enable debug logging", false)
		.option("--cwd <path>", "Directory to resolve AgenticWorkspace root from (overrides AGENTIC_WORKSPACE_CWD)")
		.action(async (options: StartOptions) => {
			try {
				const runtimeCwd = await resolveRuntimeCwd({ cwd: options.cwd });
				const projectRoot = (await findAgenticWorkspaceRoot(runtimeCwd.cwd)) ?? runtimeCwd.cwd;
				// An explicit --cwd/AGENTIC_WORKSPACE_CWD pins the root; an inferred process.cwd()
				// lets the server follow the client's workspace roots instead.
				const pinned = runtimeCwd.source !== "process";
				const server = await createMcpServer(projectRoot, { debug: options.debug, pinned });

				await server.connect();
				await server.start();

				if (options.debug) {
					if (runtimeCwd.source !== "process") {
						console.error(`Using MCP start directory from ${runtimeCwd.sourceLabel}: ${runtimeCwd.cwd}`);
					}
					console.error("AgenticWorkspace MCP server started (stdio transport)");
				}

				registerShutdownHandlers(server, Boolean(options.debug));
			} catch (error) {
				// A config value AgenticWorkspace refuses to read already names the file, the key, and the fix,
				// so it is reported as written instead of behind a startup summary.
				if (isConfigValueError(error)) {
					console.error(error.message);
				} else {
					const message = error instanceof Error ? error.message : String(error);
					console.error(`Failed to start MCP server: ${message}`);
				}
				throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
			}
		});
}
