import { afterEach, describe, expect, it } from "bun:test";
import { watch as watchFile } from "node:fs";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExistingAgentHost } from "./existing-agent-host.ts";
import type { TmuxExec, TmuxResult } from "./tmux/types.ts";

const waitFor = async (
	predicate: () => boolean,
	message = "Timed out waiting for fake observer output",
): Promise<void> => {
	const deadline = Date.now() + 10_000;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error(message);
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
};

describe("bare existing-agent observers", () => {
	const directories: string[] = [];
	afterEach(async () => {
		await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	it("snapshots and tails independently; detaching readers never changes the shared runtime", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-fake-observers-"));
		directories.push(directory);
		const outputPath = join(directory, "session.log");
		await writeFile(outputPath, "old transcript");
		const screen = "current screen";
		const commands: Array<{ argv: string[]; signal?: AbortSignal }> = [];
		const exec: TmuxExec = {
			run: async (argv, options): Promise<TmuxResult> => {
				commands.push({ argv: [...argv], signal: options?.signal });
				const stdout = argv[0] === "display-message" ? "0" : argv[0] === "capture-pane" ? screen : "";
				return { exitCode: 0, stdout, stderr: "", durationMs: 0 };
			},
		};
		const outputs = ["", ""];
		const makeHost = (index: number) =>
			createExistingAgentHost({
				exec,
				paneId: "%91",
				outputPath,
				onOutput: (bytes) => (outputs[index] += new TextDecoder().decode(bytes)),
				onError: (error) => {
					throw error;
				},
			});
		const first = makeHost(0);
		const second = makeHost(1);
		try {
			await Promise.all([first.start(), second.start()]);
			for (const output of outputs) {
				expect(output).toContain("current screen");
				expect(output).not.toContain("old transcript");
			}
			await appendFile(outputPath, "shared append");
			await waitFor(() => outputs.every((output) => output.includes("shared append")));
			first.sendBytes(new Uint8Array([0x41]));
			second.sendBytes(new Uint8Array([0x42]));
			await Promise.all([first.flushInput(), second.flushInput()]);
			await Promise.all([first.resize(91, 27), second.resize(92, 28)]);
			expect(commands.filter(({ argv }) => argv[0] === "send-keys")).toHaveLength(2);
			expect(commands.filter(({ argv }) => argv[0] === "resize-window")).toHaveLength(2);
			expect(commands.filter(({ argv }) => argv[0] === "resize-pane")).toHaveLength(2);

			await expect(first.detach?.()).resolves.toBe("retained");
			await appendFile(outputPath, "after first detach");
			await waitFor(() => outputs[1]?.includes("after first detach") === true);
			expect(outputs[0]).not.toContain("after first detach");
			second.sendBytes(new Uint8Array([0x43]));
			await second.flushInput();
			await second.resize(93, 29);
			await expect(second.detach?.()).resolves.toBe("retained");
			await appendFile(outputPath, "after both detach");

			const runtimeCommands = commands.filter(({ argv }) =>
				["kill-pane", "kill-session", "kill-server", "pipe-pane"].includes(argv[0] ?? ""),
			);
			expect(runtimeCommands).toEqual([]);
			expect(await Bun.file(outputPath).text()).toBe("old transcriptshared appendafter first detachafter both detach");
			const commandCount = commands.length;
			const reattachedOutput: string[] = [];
			const reattached = createExistingAgentHost({
				exec,
				paneId: "%91",
				outputPath,
				onOutput: (bytes) => reattachedOutput.push(new TextDecoder().decode(bytes)),
				onError: (error) => {
					throw error;
				},
			});
			try {
				await reattached.start();
				expect(reattachedOutput.join("")).toContain("current screen");
				await appendFile(outputPath, "reattached output");
				await waitFor(() => reattachedOutput.join("").includes("reattached output"));
				const current = reattachedOutput.join("");
				expect(current).toContain("current screen");
				expect(current).not.toContain("old transcript");
				expect(current).not.toContain("shared append");
				expect(current).not.toContain("after first detach");
				expect(current).not.toContain("after both detach");
				expect(current).toContain("reattached output");
			} finally {
				await reattached.detach?.();
			}
			expect(commands.length).toBeGreaterThan(commandCount);
		} finally {
			await Promise.all([first.stop(), second.stop()]);
		}
	});

	it("cleans up only local resources when a bare observer cannot snapshot", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-fake-observer-failure-"));
		directories.push(directory);
		const outputPath = join(directory, "session.log");
		await writeFile(outputPath, "untouched");
		const commands: string[] = [];
		const host = createExistingAgentHost({
			exec: {
				run: async (argv): Promise<TmuxResult> => {
					commands.push(argv[0] ?? "");
					return argv[0] === "capture-pane"
						? { exitCode: 1, stdout: "", stderr: "snapshot failed", durationMs: 0 }
						: { exitCode: 0, stdout: "0", stderr: "", durationMs: 0 };
				},
			},
			paneId: "%92",
			outputPath,
			onOutput: () => {},
			onError: () => {},
		});
		await expect(host.start()).rejects.toThrow("snapshot failed");
		expect(commands).not.toContain("kill-session");
		expect(commands).not.toContain("kill-pane");
		expect(commands).not.toContain("pipe-pane");
		expect(await Bun.file(outputPath).text()).toBe("untouched");
	});

	it("stop and detach dispose only local readers and never alter the pane or capture pipe", async () => {
		const commands: string[] = [];
		const outputs: string[] = [];
		let eventObserved = false;
		let phase = "fixture setup";
		const startedAt = performance.now();
		const diagnosticTimer = setTimeout(
			() =>
				console.error("observer stop/detach pre-timeout", {
					phase,
					elapsedMs: Math.round(performance.now() - startedAt),
					eventObserved,
					outputCount: outputs.length,
					commands: [...commands],
				}),
			8_000,
		);
		try {
			phase = "fixture directory";
			const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-fake-observer-dispose-"));
			directories.push(directory);
			const outputPath = join(directory, "session.log");
			phase = "fixture write";
			await writeFile(outputPath, "existing capture");
			const exec: TmuxExec = {
				run: async (argv): Promise<TmuxResult> => {
					commands.push(argv[0] ?? "");
					return {
						exitCode: 0,
						stdout: argv[0] === "display-message" ? "0" : argv[0] === "capture-pane" ? "screen" : "",
						stderr: "",
						durationMs: 0,
					};
				},
			};
			const stopped = createExistingAgentHost({
				exec,
				paneId: "%93",
				outputPath,
				onOutput: (bytes) => outputs.push(new TextDecoder().decode(bytes)),
				onError: (error) => {
					throw error;
				},
			});
			phase = "stopped start";
			await stopped.start();
			phase = "stopped stop";
			await stopped.stop();
			const detached = createExistingAgentHost({
				exec,
				paneId: "%93",
				outputPath,
				onOutput: (bytes) => outputs.push(new TextDecoder().decode(bytes)),
				onError: (error) => {
					throw error;
				},
			});
			phase = "detached start";
			await detached.start();
			phase = "detached detach";
			await expect(detached.detach?.()).resolves.toBe("retained");
			const countAfterDetach = outputs.length;
			phase = "install event fence";
			const eventFence = watchFile(directory, () => {
				eventObserved = true;
			});
			try {
				phase = "external append";
				await appendFile(outputPath, " externally appended");
				phase = "event fence wait";
				await waitFor(() => eventObserved, "Timed out waiting for filesystem event after external append");
				phase = "output count assertion";
				expect(outputs).toHaveLength(countAfterDetach);
			} finally {
				phase = "close event fence";
				eventFence.close();
			}
			phase = "final file read";
			expect(await Bun.file(outputPath).text()).toBe("existing capture externally appended");
			phase = "final assertions";
			expect(
				commands.some((command) => ["kill-pane", "kill-session", "kill-server", "pipe-pane"].includes(command)),
			).toBe(false);
			expect(outputs.join("")).toContain("screen");
		} finally {
			clearTimeout(diagnosticTimer);
		}
	});
});
