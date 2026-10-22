import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { updateAgentConfiguration } from "../controller/agent-configuration.ts";
import { Core } from "../controller/agentic-workspace.ts";
import { getDefaultModeCatalog } from "../storage/config.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const TUI_CLI_PATH = process.env.TUI_TEST_CLI_PATH?.trim();
const CLI_RUNTIME = process.env.TUI_TEST_CLI_RUNTIME?.trim() ?? "bun";
const CLI_COMMAND = TUI_CLI_PATH
	? CLI_RUNTIME.length === 0
		? [TUI_CLI_PATH]
		: [CLI_RUNTIME, TUI_CLI_PATH]
	: getTestCliCommand();
const TRANSCRIPT_DIR = join(process.cwd(), "tmp", "tui-interactive-transcripts");
const EXPECT_PATH = Bun.which("expect");
const RUN_INTERACTIVE_TUI_TESTS = process.env.RUN_INTERACTIVE_TUI_TESTS === "1";

function getSkipReason(): string | null {
	if (process.platform === "win32") {
		return "interactive PTY tests require a Unix-like environment";
	}
	if (!RUN_INTERACTIVE_TUI_TESTS) {
		return "set RUN_INTERACTIVE_TUI_TESTS=1 to enable interactive PTY tests";
	}
	if (!EXPECT_PATH) {
		return "expect is not installed";
	}
	return null;
}

const skipReason = getSkipReason();
if (skipReason) {
	console.warn(`[tui-interactive] Skipping interactive editor handoff tests: ${skipReason}`);
}
const itInteractive = skipReason ? it.skip : it;

function buildSpawnCommand(cliArgs: string[]): string {
	return `spawn ${[...CLI_COMMAND, ...cliArgs].map((part) => `{${part}}`).join(" ")}`;
}

function buildExecCommand(cliArgs: string[]): string {
	return `exec ${[...CLI_COMMAND, ...cliArgs].map((part) => `{${part}}`).join(" ")}`;
}

async function runLiveRefreshScenario(): Promise<{ title: string; transcriptPath: string }> {
	const scenario = "live-refresh";
	const testDir = createUniqueTestDir(`test-tui-interactive-${scenario}`);
	await mkdir(testDir, { recursive: true });
	await mkdir(TRANSCRIPT_DIR, { recursive: true });
	const transcriptPath = join(TRANSCRIPT_DIR, `${scenario}-${Date.now()}.log`);
	const expectScriptPath = join(testDir, `${scenario}.expect`);

	await $`git init -b main`.cwd(testDir).quiet();
	await initializeTestProject(new Core(testDir), "Interactive live refresh", false, "test-data");
	const core = new Core(testDir);
	await updateAgentConfiguration(core, "project", (configuration) => ({
		...configuration,
		modes: getDefaultModeCatalog(),
	}));
	const config = await coreFileSystem(core).loadConfig();
	if (!config) throw new Error("Failed to load live refresh config");
	await core.createTask({
		id: "task-1",
		title: "before-refresh",
		status: "To Do",
		createdDate: "2026-07-14 00:00",
		labels: [],
		dependencies: [],
		description: "Compiled TUI live refresh test",
	});

	await writeFile(
		expectScriptPath,
		`#!/usr/bin/expect -f
set timeout 20
log_user 0
log_file -a {${transcriptPath}}
set env(TERM) {xterm-256color}
set env(COLUMNS) {120}
set env(LINES) {40}
set env(NO_COLOR) {1}
set stty_init {rows 40 columns 120}
${buildSpawnCommand(["workspace"])}
expect {
	-re {before-refresh} {}
	timeout { exit 91 }
}
set mutation_code [catch {${buildExecCommand(["task", "edit", "task-1", "--title", "LIVE_REFRESHED"])} } mutation_output]
if {$mutation_code != 0} { puts stderr $mutation_output; exit 92 }
expect {
	-re {LIVE_REFRESHED} {}
	timeout { exit 93 }
}
send -- "\\x03"
expect eof
set wait_status [wait]
set exit_code [lindex $wait_status 3]
exit $exit_code
`,
	);

	const child = Bun.spawn(["expect", "-f", expectScriptPath], {
		cwd: testDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdoutPromise = child.stdout ? new Response(child.stdout).text() : Promise.resolve("");
	const stderrPromise = child.stderr ? new Response(child.stderr).text() : Promise.resolve("");
	let exitCode: number;
	let stdout: string;
	let stderr: string;
	let transcript: string;
	let finalTask: Awaited<ReturnType<ReturnType<typeof coreFileSystem>["loadTask"]>>;
	try {
		let timeout: ReturnType<typeof setTimeout>;
		try {
			exitCode = await Promise.race([
				child.exited,
				new Promise<never>((_, reject) => {
					timeout = setTimeout(() => reject(new Error("Interactive CLI live refresh timed out")), 30_000);
				}),
			]);
		} finally {
			clearTimeout(timeout!);
		}
		[stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
		transcript = await Bun.file(transcriptPath)
			.text()
			.catch(() => "(no transcript captured)");
		finalTask = await coreFileSystem(core).loadTask("task-1");
	} finally {
		try {
			child.kill();
			let cleanupTimeout: ReturnType<typeof setTimeout>;
			try {
				await Promise.race([
					child.exited,
					new Promise<void>((resolve) => {
						cleanupTimeout = setTimeout(resolve, 5_000);
					}),
				]);
			} finally {
				clearTimeout(cleanupTimeout!);
			}
		} finally {
			await safeCleanup(testDir);
		}
	}

	if (![0, 130].includes(exitCode)) {
		throw new Error(
			`Interactive CLI live refresh failed.\nExit code: ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\nTranscript: ${transcriptPath}\nTranscript contents:\n${transcript}\n`,
		);
	}
	return { title: finalTask?.title ?? "missing", transcriptPath };
}

describe("interactive TUI editor handoff", () => {
	itInteractive("shows a CLI mutation in the open board within a bounded time", async () => {
		const result = await runLiveRefreshScenario();
		expect(result.title).toBe("LIVE_REFRESHED");
		expect(result.transcriptPath).toContain("tui-interactive-transcripts");
	});
});
