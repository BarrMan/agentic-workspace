import { describe, expect, it, spyOn } from "bun:test";
import { Command } from "commander";
import {
	addListWindowOptions,
	formatListWindowFooter,
	type ListPage,
	type ListWindow,
	nextPageCommand,
	parseListWindow,
	selectListWindow,
} from "../utils/list-window.ts";

/** `agentic-workspace task list` with the window options and one option that reads a value, `--search`. */
function taskListCommand(): Command {
	return addListWindowOptions(
		new Command("agentic-workspace").command("task").command("list").option("--search <query>"),
	);
}

function windowOf(skip: number, maxCount?: number, commandArgs: string[] = []): ListWindow {
	const window = parseListWindow(
		{ skip: String(skip), maxCount: maxCount === undefined ? undefined : String(maxCount) },
		taskListCommand(),
		commandArgs,
	);
	if (!window) throw new Error("invalid test window");
	return window;
}

describe("list windows", () => {
	it("covers every item exactly once when following nextSkip", () => {
		for (const size of [0, 1, 5, 6, 7]) {
			const items = Array.from({ length: size }, (_, index) => index);
			for (const maxCount of [1, 2, 3, 10]) {
				const seen: number[] = [];
				let skip: number | null = 0;
				while (skip !== null) {
					const page: ListPage<number> = selectListWindow(items, windowOf(skip, maxCount));
					seen.push(...page.items);
					skip = page.nextSkip;
				}
				expect(seen).toEqual(items);
			}
		}
	});

	it("marks only windows that leave items out as cut", () => {
		const items = ["a", "b", "c"];

		expect(selectListWindow(items, windowOf(0))).toMatchObject({ items, cut: false, nextSkip: null });
		expect(selectListWindow(items, windowOf(0, 3))).toMatchObject({ items, cut: false, nextSkip: null });
		expect(selectListWindow([], windowOf(4, 2))).toMatchObject({ items: [], total: 0, cut: false, nextSkip: null });
		expect(selectListWindow(items, windowOf(0, 2))).toMatchObject({ items: ["a", "b"], cut: true, nextSkip: 2 });
		expect(selectListWindow(items, windowOf(2, 2))).toMatchObject({ items: ["c"], cut: true, nextSkip: null });
		expect(selectListWindow(items, windowOf(1))).toMatchObject({ items: ["b", "c"], cut: true, nextSkip: null });
		expect(selectListWindow(items, windowOf(3, 2))).toMatchObject({ items: [], total: 3, cut: true, nextSkip: null });
	});

	it("prints a footer only for cut output and names the next command while items follow", () => {
		const items = ["a", "b", "c", "d", "e"];
		const args = ["task", "list", "--max-count", "2", "--plain"];
		const footer = (skip: number, maxCount: number) => {
			const window = windowOf(skip, maxCount, args);
			return formatListWindowFooter(selectListWindow(items, window), window);
		};

		expect(footer(0, 5)).toBeNull();
		expect(footer(2, 2)).toBe(
			"Showing 3-4 of 5 items. Next: agentic-workspace task list --max-count 2 --plain --skip 4",
		);
		expect(footer(4, 2)).toBe("Showing 5-5 of 5 items.");
		expect(footer(9, 2)).toBe("Showing 0 of 5 items.");
	});

	it("replaces the typed skip and quotes arguments the shell would split", () => {
		expect(nextPageCommand(windowOf(0, 3, ["task", "list", "--skip", "3", "--max-count", "3"]), 6)).toBe(
			"agentic-workspace task list --max-count 3 --skip 6",
		);
		expect(
			nextPageCommand(
				windowOf(0, 3, ["search", "--skip=3", "it's done", "--status", "To Do", "=draft", "--priority=high"]),
				6,
			),
		).toBe("agentic-workspace search 'it'\\''s done' --status 'To Do' '=draft' '--priority=high' --skip 6");
	});

	it("keeps option values that read --skip or -- and puts the new skip before --", () => {
		const next = (args: string[]) => nextPageCommand(windowOf(0, 1, args), 1);

		expect(next(["task", "list", "--search", "--skip", "--max-count", "1"])).toBe(
			"agentic-workspace task list --search --skip --max-count 1 --skip 1",
		);
		expect(next(["task", "list", "--search", "--skip", "--skip", "3", "--max-count", "1"])).toBe(
			"agentic-workspace task list --search --skip --max-count 1 --skip 1",
		);
		expect(next(["task", "list", "--search", "--", "--max-count", "1"])).toBe(
			"agentic-workspace task list --search -- --max-count 1 --skip 1",
		);
		expect(next(["doc", "list", "--max-count", "1", "--"])).toBe(
			"agentic-workspace doc list --max-count 1 --skip 1 --",
		);
		expect(next(["search", "--max-count", "1", "--", "--skip", "it"])).toBe(
			"agentic-workspace search --max-count 1 --skip 1 -- --skip it",
		);
	});

	it("accepts a positive max-count, a non-negative skip, and count without JSON", () => {
		const args = ["task", "list"];
		expect(parseListWindow({}, taskListCommand(), args)).toMatchObject({
			skip: 0,
			maxCount: undefined,
			count: false,
			forcesText: false,
			commandArgs: args,
		});
		expect(parseListWindow({ maxCount: "5", skip: "0" }, taskListCommand(), args)).toMatchObject({
			skip: 0,
			maxCount: 5,
			count: false,
			forcesText: true,
		});
		expect(parseListWindow({ count: true }, taskListCommand(), args)).toMatchObject({
			count: true,
			forcesText: true,
		});
	});

	it("rejects invalid window values and count with JSON", () => {
		const errors = spyOn(console, "error").mockImplementation(() => {});
		const previousExitCode = process.exitCode;
		try {
			for (const options of [{ maxCount: "0" }, { maxCount: "2.5" }, { skip: "-1" }, { skip: "x" }]) {
				process.exitCode = 0;
				expect(parseListWindow(options, taskListCommand(), [])).toBeNull();
				expect(process.exitCode).toBe(1);
			}
			expect(parseListWindow({ count: true, json: true }, taskListCommand(), [])).toBeNull();
			expect(errors).toHaveBeenLastCalledWith(
				"--count cannot be combined with --json. Try 'agentic-workspace task list --help' for options.",
			);
		} finally {
			errors.mockRestore();
			process.exitCode = previousExitCode ?? 0;
		}
	});
});
