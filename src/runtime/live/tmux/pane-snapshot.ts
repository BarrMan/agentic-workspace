import type { TmuxExec } from "./types.ts";

export type PaneSnapshot = {
	readonly bytes: Uint8Array;
	readonly cols: number;
	readonly rows: number;
	readonly cursorX: number;
	readonly cursorY: number;
	readonly cursorVisible: boolean;
	readonly modes: string;
};

export type PaneSnapshotOptions = {
	readonly exec: TmuxExec;
	readonly paneId: string;
	/** Monotonically incremented for each live output chunk, to reject interleaved captures. */
	readonly outputGeneration: () => number;
	readonly attempts?: number;
};

/** Capture a bounded tmux screen seed; control metadata is kept out of terminal bytes. */
export const capturePaneSnapshot = async (options: PaneSnapshotOptions): Promise<PaneSnapshot | null> => {
	for (let attempt = 0; attempt < (options.attempts ?? 3); attempt++) {
		const before = options.outputGeneration();
		const [screen, state] = await Promise.all([
			options.exec.run(["capture-pane", "-e", "-p", "-t", options.paneId]),
			options.exec.run([
				"display-message",
				"-p",
				"-t",
				options.paneId,
				"#{pane_width} #{pane_height} #{cursor_x} #{cursor_y} #{cursor_flag} #{alternate_on}",
			]),
		]);
		if (screen.exitCode !== 0 || state.exitCode !== 0 || before !== options.outputGeneration()) continue;
		const [cols, rows, cursorX, cursorY, cursorFlag, alternate] = state.stdout.trim().split(/\s+/).map(Number);
		if (![cols, rows, cursorX, cursorY].every(Number.isFinite)) continue;
		const checkedCols = cols as number;
		const checkedRows = rows as number;
		const checkedCursorX = cursorX as number;
		const checkedCursorY = cursorY as number;
		const body = screen.stdout.replace(/\r?\n$/, "");
		const modes = `${alternate ? "\u001b[?1049h" : "\u001b[?1049l"}\u001b[?1;2;6;7;2004${"h"}`;
		const bytes = Buffer.from(
			`\u001b[?25l\u001b[2J\u001b[H${body}\u001b[${checkedCursorY + 1};${checkedCursorX + 1}H${modes}${Number(cursorFlag) ? "\u001b[?25h" : "\u001b[?25l"}`,
		);
		return {
			bytes,
			cols: checkedCols,
			rows: checkedRows,
			cursorX: checkedCursorX,
			cursorY: checkedCursorY,
			cursorVisible: Boolean(cursorFlag),
			modes,
		};
	}
	return null;
};
