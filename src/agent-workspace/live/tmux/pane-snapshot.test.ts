import { expect, it } from "bun:test";
import { capturePaneSnapshot } from "./pane-snapshot.ts";

it("captures bounded screen bytes and separate geometry/cursor metadata without trailing newline", async () => {
	const generation = 0;
	const exec = {
		run: async (argv: readonly string[]) => ({
			exitCode: 0,
			stdout: argv[0] === "capture-pane" ? "\u001b[31mhello\n" : "80 24 4 2 1 0",
			stderr: "",
			durationMs: 0,
		}),
	};
	const snapshot = await capturePaneSnapshot({ exec, paneId: "%2", outputGeneration: () => generation });
	expect(snapshot?.cols).toBe(80);
	expect(snapshot?.cursorX).toBe(4);
	expect(snapshot?.cursorVisible).toBe(true);
	expect(Buffer.from(snapshot?.bytes ?? []).toString()).not.toEndWith("\n");
	expect(Buffer.from(snapshot?.bytes ?? []).toString()).toContain("\u001b[31mhello");
});

it("retries captures interleaved with live output and gives up within the bound", async () => {
	let generation = 0;
	const exec = {
		run: async (argv: readonly string[]) => {
			if (argv[0] === "capture-pane") generation++;
			return { exitCode: 0, stdout: argv[0] === "capture-pane" ? "x" : "80 24 0 0 1 0", stderr: "", durationMs: 0 };
		},
	};
	expect(await capturePaneSnapshot({ exec, paneId: "%3", outputGeneration: () => generation, attempts: 2 })).toBeNull();
});
