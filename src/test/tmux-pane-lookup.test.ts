import { describe, expect, it } from "bun:test";
import { findTmuxPanesByTaskAndRole } from "../agent-workspace/tmux-pane-lookup.ts";

describe("durable tmux pane identity", () => {
	it("matches task identity case-insensitively without rewriting the pane tag", async () => {
		const panes = await findTmuxPanesByTaskAndRole({
			rootPath: "/project",
			taskId: " task-1 ",
			role: "live-preview",
			listPanes: async () => ["%1\t0\t@1\t/project\tTASK-1\tsession-1\tlive-preview\tTASK-1 live-preview"],
		});

		expect(panes.map(({ taskId }) => taskId)).toEqual(["TASK-1"]);
	});

	it("finds a renamed agent without accepting foreign, mistagged, or dead panes", async () => {
		const panes = await findTmuxPanesByTaskAndRole({
			rootPath: "/project",
			taskId: "TASK-1",
			role: "live-preview",
			listPanes: async () => [
				"%1\t0\t@1\t/project\tTASK-1\tsession-1\tlive-preview\tOpenCode",
				"%2\t0\t@2\t/other-project\tTASK-1\tsession-1\tlive-preview\tTASK-1 live-preview",
				"%3\t0\t@3\t/project\tTASK-2\tsession-1\tlive-preview\tTASK-1 live-preview",
				"%4\t0\t@4\t/project\tTASK-1\tsession-1\ttask-list\tTASK-1 live-preview",
				"%5\t1\t@5\t/project\tTASK-1\tsession-1\tlive-preview\tOpenCode",
			],
		});

		expect(panes.map((pane) => pane.paneId)).toEqual(["%1"]);
	});
});
