import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const executablePath = process.argv[2];
const expectedVersion = process.argv[3];

if (!executablePath || !expectedVersion) {
	throw new Error("Usage: bun scripts/smoke-compiled-build.ts <executable-path> <expected-version>");
}

const executable = resolve(executablePath);
const operationTimeout = process.platform === "win32" ? 16000 : 8000;
const fixtureEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
	if (value !== undefined) {
		fixtureEnv[key] = value;
	}
}
for (const key of ["AGENTIC_WORKSPACE_CWD", "AGENTIC_WORKSPACE_WORKSPACE_CONTEXT", "AGENTIC_WORKSPACE_TASK_ID", "AGENTIC_WORKSPACE_TMUX_SOCKET"]) {
	delete fixtureEnv[key];
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

type CapturedFailure = { error: unknown };
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(operation: Promise<T>): Promise<Outcome<T>> {
	return operation.then(
		(value) => ({ ok: true, value }),
		(error: unknown) => ({ ok: false, error }),
	);
}

async function unwrapOutcome<T>(operation: Promise<Outcome<T>>, label: string): Promise<T> {
	const outcome = await withTimeout(operation, label, operationTimeout, () => "");
	if (!outcome.ok) {
		throw outcome.error;
	}
	return outcome.value;
}

function throwAfterCleanup(
	label: string,
	operationFailure: CapturedFailure | undefined,
	cleanupFailures: Error[],
	diagnostics = "",
): void {
	const failures = [...(operationFailure ? [operationFailure.error] : []), ...cleanupFailures].map((error) =>
		error instanceof Error ? error : new Error(String(error)),
	);
	if (failures.length === 0) {
		return;
	}

	const message = `${label} failed.${diagnostics ? `\n${diagnostics}` : ""}`;
	if (failures.length === 1) {
		throw new Error(message, { cause: failures[0] });
	}
	throw new AggregateError(failures, message);
}

async function captureCleanupFailure(
	cleanupFailures: Error[],
	label: string,
	cleanup: () => Promise<void>,
): Promise<void> {
	try {
		await cleanup();
	} catch (error) {
		cleanupFailures.push(new Error(label, { cause: error }));
	}
}

function waitForTransportClose(transport: StdioClientTransport): Promise<void> {
	if (transport.pid === null) {
		return Promise.resolve();
	}

	const previousOnClose = transport.onclose;
	return new Promise((resolveClose, reject) => {
		transport.onclose = () => {
			try {
				previousOnClose?.();
				resolveClose();
			} catch (error) {
				reject(error);
			}
		};
	});
}

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs: number, details: () => string): Promise<T> {
	return new Promise((resolveOperation, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms.${details()}`));
		}, timeoutMs);

		operation.then(
			(value) => {
				clearTimeout(timer);
				resolveOperation(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

async function run(executableAndArgs: string[], cwd = process.cwd()): Promise<string> {
	const child = Bun.spawn(executableAndArgs, {
		cwd,
		env: fixtureEnv,
		stderr: "pipe",
		stdout: "pipe",
	});
	const stdoutResult = settle(new Response(child.stdout).text());
	const stderrResult = settle(new Response(child.stderr).text());
	let childExited = false;
	const exited = settle(child.exited).then((outcome) => {
		childExited = true;
		return outcome;
	});

	let operationFailure: CapturedFailure | undefined;
	try {
		const exitCode = await unwrapOutcome(exited, `${executableAndArgs.join(" ")} exit`);
		assert(exitCode === 0, `${executableAndArgs.join(" ")} exited with ${exitCode}.`);
	} catch (error) {
		operationFailure = { error };
	}

	const cleanupFailures: Error[] = [];
	if (!childExited) {
		await captureCleanupFailure(cleanupFailures, `Failed to stop ${executableAndArgs.join(" ")}.`, async () => {
			child.kill("SIGKILL");
		});
	}
	await captureCleanupFailure(
		cleanupFailures,
		`${executableAndArgs.join(" ")} did not reach terminal state.`,
		async () => {
			await unwrapOutcome(exited, `${executableAndArgs.join(" ")} close`);
		},
	);

	let stdout = "";
	let stderr = "";
	await captureCleanupFailure(cleanupFailures, `Failed to read ${executableAndArgs.join(" ")} stdout.`, async () => {
		stdout = await unwrapOutcome(stdoutResult, `${executableAndArgs.join(" ")} stdout`);
	});
	await captureCleanupFailure(cleanupFailures, `Failed to read ${executableAndArgs.join(" ")} stderr.`, async () => {
		stderr = await unwrapOutcome(stderrResult, `${executableAndArgs.join(" ")} stderr`);
	});
	throwAfterCleanup(
		`Compiled CLI command ${executableAndArgs.join(" ")}`,
		operationFailure,
		cleanupFailures,
		[`stdout:\n${stdout}`, `stderr:\n${stderr}`].join("\n"),
	);
	return stdout;
}

const helpOutput = await run([executable, "--help"]);
assert(helpOutput.includes("AgenticWorkspace - Project management CLI"), "Compiled CLI help is missing its title.");

const versionOutput = (await run([executable, "--version"])).trim();
assert(versionOutput === expectedVersion, `Expected compiled version ${expectedVersion}, received ${versionOutput}.`);

const smokeRoot = await mkdtemp(join(tmpdir(), "agentic-workspace-compiled-smoke-"));
fixtureEnv.HOME = join(smokeRoot, ".home");
fixtureEnv.USERPROFILE = fixtureEnv.HOME;
fixtureEnv.XDG_CONFIG_HOME = join(smokeRoot, ".config");
await Bun.$`mkdir -p ${fixtureEnv.HOME} ${fixtureEnv.XDG_CONFIG_HOME}`;
let smokeFailure: CapturedFailure | undefined;
try {
	await run([executable, "init", "Compiled Smoke", "--defaults", "--no-git", "--integration-mode", "none"], smokeRoot);

	let mcpStderr = "";
	const transport = new StdioClientTransport({
		command: executable,
		args: ["mcp", "start", "--cwd", smokeRoot, "--debug"],
		cwd: smokeRoot,
		env: fixtureEnv,
		stderr: "pipe",
	});
	transport.stderr?.on("data", (chunk) => {
		mcpStderr += chunk.toString();
	});

	const client = new Client({ name: "Compiled MCP Smoke Test", version: "1.0.0" }, { capabilities: {} });
	let mcpFailure: CapturedFailure | undefined;
	try {
		await withTimeout(client.connect(transport), "MCP connect", operationTimeout, () => ` stderr:\n${mcpStderr}`);
		const tools = await withTimeout(
			client.listTools(),
			"MCP listTools",
			operationTimeout,
			() => ` stderr:\n${mcpStderr}`,
		);
		assert(
			tools.tools.some((tool) => tool.name === "task_list"),
			"Compiled MCP server is missing task_list.",
		);
		const created = await withTimeout(
			client.callTool({ name: "task_create", arguments: { title: "Compiled Smoke Persisted Task" } }),
			"MCP task_create",
			operationTimeout,
			() => ` stderr:\n${mcpStderr}`,
		);
		assert(!created.isError, `Compiled MCP task_create returned an error: ${JSON.stringify(created)}`);
		const createdText = (created.content as Array<{ text?: string }>)[0]?.text ?? "";
		assert(
			createdText.split("\n").includes("Task TASK-1 - Compiled Smoke Persisted Task"),
			`Compiled MCP task_create did not return the expected task header: ${createdText}`,
		);
		const viewed = await withTimeout(
			client.callTool({ name: "task_view", arguments: { id: "TASK-1" } }),
			"MCP task_view",
			operationTimeout,
			() => ` stderr:\n${mcpStderr}`,
		);
		assert(!viewed.isError, `Compiled MCP task_view returned an error: ${JSON.stringify(viewed)}`);
		const viewedText = (viewed.content as Array<{ text?: string }>)[0]?.text ?? "";
		assert(
			viewedText.split("\n").includes("Task TASK-1 - Compiled Smoke Persisted Task"),
			`Compiled MCP task_view did not read back the expected task header: ${viewedText}`,
		);
		const resources = await withTimeout(
			client.listResources(),
			"MCP listResources",
			operationTimeout,
			() => ` stderr:\n${mcpStderr}`,
		);
		assert(
			resources.resources.some((resource) => resource.uri === "agentic-workspace://workflow/overview"),
			"Compiled MCP server is missing its workflow overview resource.",
		);
	} catch (error) {
		mcpFailure = { error };
	}

	const transportClosed = settle(waitForTransportClose(transport));
	const mcpCleanupFailures: Error[] = [];
	await captureCleanupFailure(mcpCleanupFailures, "Failed to close compiled MCP client.", async () => {
		await client.close();
	});
	await captureCleanupFailure(mcpCleanupFailures, "Compiled MCP child process did not close.", async () => {
		await unwrapOutcome(transportClosed, "MCP child close");
	});
	throwAfterCleanup(
		"Compiled MCP smoke check",
		mcpFailure,
		mcpCleanupFailures,
		mcpStderr ? `stderr:\n${mcpStderr}` : "",
	);
} catch (error) {
	smokeFailure = { error };
}

const fixtureCleanupFailures: Error[] = [];
await captureCleanupFailure(fixtureCleanupFailures, "Failed to remove compiled smoke project.", async () => {
	await rm(smokeRoot, { recursive: true, force: true });
});
throwAfterCleanup("Compiled build smoke checks", smokeFailure, fixtureCleanupFailures);

console.log(`Compiled build smoke checks passed for ${executable}.`);
