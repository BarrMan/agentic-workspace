import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
for (const key of [
	"AGENTIC_WORKSPACE_CWD",
	"AGENTIC_WORKSPACE_WORKSPACE_CONTEXT",
	"AGENTIC_WORKSPACE_TASK_ID",
	"AGENTIC_WORKSPACE_TMUX_SOCKET",
]) {
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
	await mkdir(join(smokeRoot, "agentic-workspace"), { recursive: true });
	await writeFile(
		join(smokeRoot, "agentic-workspace", "config.yml"),
		[
			'project_name: "Compiled Smoke"',
			'default_status: "To Do"',
			'statuses: ["To Do", "Done"]',
			"date_format: yyyy-MM-dd",
			"max_column_width: 20",
			"remote_operations: false",
			"filesystem_only: false",
			"check_active_branches: false",
			"active_branch_days: 30",
			'task_prefix: "task"',
			"",
		].join("\n"),
	);
	await run([executable, "task", "create", "Compiled Smoke"], smokeRoot);
} catch (error) {
	smokeFailure = { error };
}

const fixtureCleanupFailures: Error[] = [];
await captureCleanupFailure(fixtureCleanupFailures, "Failed to remove compiled smoke project.", async () => {
	await rm(smokeRoot, { recursive: true, force: true });
});
throwAfterCleanup("Compiled build smoke checks", smokeFailure, fixtureCleanupFailures);

console.log(`Compiled build smoke checks passed for ${executable}.`);
