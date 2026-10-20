import { describe, expect, it } from "bun:test";
import { TaskWizardCancelledError } from "../cli/errors/wizard.ts";
import {
	pickTaskForEditWizard,
	runTaskCreateWizard,
	runTaskEditWizard,
	type TaskWizardPromptRunner,
} from "../cli/features/tasks/wizard.ts";
import type { Task } from "../model/types.ts";

type PromptResponses = Record<string, string | string[]>;

function createPromptRunner(responses: PromptResponses): TaskWizardPromptRunner {
	const state = new Map<string, string[]>();
	for (const [key, value] of Object.entries(responses)) {
		state.set(key, Array.isArray(value) ? [...value] : [value]);
	}

	return async (question) => {
		const queue = state.get(question.name) ?? [];
		if (queue.length === 0) {
			return { [question.name]: question.initial ?? "" };
		}
		while (queue.length > 0) {
			const candidate = queue.shift() ?? "";
			const validationResult = question.validate?.(candidate);
			if (!validationResult) {
				state.set(question.name, queue);
				return { [question.name]: candidate };
			}
		}
		throw new Error(`No valid prompt value remaining for '${question.name}'.`);
	};
}

describe("task wizard", () => {
	it("splits wizard list input on CRLF without splitting commas", async () => {
		const input = await runTaskCreateWizard({
			statuses: ["To Do"],
			promptImpl: createPromptRunner({ title: "CRLF list", labels: "alpha\r\nbeta, alpha" }),
		});

		expect(input?.labels).toEqual(["alpha", "beta, alpha"]);
	});

	it("builds create input from shared wizard fields", async () => {
		const prompt = createPromptRunner({
			title: "Create from wizard",
			description: "Wizard description",
			status: "In Progress",
			priority: " medium ",
			type: "epic",
			dueDate: "2026-08-10",
			labels: "cli\nwizard",
			references: "src/cli.ts\ndocs/plan.md",
			documentation: "docs/spec.md",
			dependencies: "task-1\n2",
		});

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			types: ["Bug", "Epic"],
			priorities: ["Low", "Medium", "High"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.title).toBe("Create from wizard");
		expect(input?.description).toBe("Wizard description");
		expect(input?.status).toBe("In Progress");
		expect(input?.priority).toBe("Medium");
		expect(input?.type).toBe("Epic");
		expect(input?.dueDate).toBe("2026-08-10");
		expect(input?.labels).toEqual(["cli", "wizard"]);
		expect(input?.references).toEqual(["src/cli.ts", "docs/plan.md"]);
		expect(input?.documentation).toEqual(["docs/spec.md"]);
		// Dependency IDs stay exactly as typed; Core resolves them against real task IDs, which is the
		// only place the configured ID prefix is known.
		expect(input?.dependencies).toEqual(["task-1", "2"]);
	});

	it("does not rewrite a status that does not exactly match configuration", async () => {
		const prompt = createPromptRunner({ title: "Status identity", status: "inprogress" });

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			promptImpl: prompt,
		});

		expect(input?.status).toBe("inprogress");
	});

	it("builds prefilled edit update input", async () => {
		const existingTask: Task = {
			id: "task-9",
			title: "Old title",
			status: "To Do",
			priority: "low",
			type: "Bug",
			createdDate: "2026-02-20 12:00",
			dueDate: "2026-08-10",
			labels: ["existing"],
			dependencies: ["task-1"],
			references: ["docs/old.md"],
			documentation: ["docs/current.md"],
			description: "Old description",
			rawContent: "",
		};
		const prompt = createPromptRunner({
			title: "New title",
			description: "New description",
			status: "In Progress",
			priority: " urgent ",
			type: "Epic",
			dueDate: "",
			labels: "existing\ncli",
			references: "docs/new.md\nsrc/cli.ts",
			documentation: "docs/spec.md",
			dependencies: "task-2\n3",
		});

		const updateInput = await runTaskEditWizard({
			task: existingTask,
			statuses: ["To Do", "In Progress", "Done"],
			types: ["Bug", "Epic"],
			priorities: ["Low", "Urgent"],
			promptImpl: prompt,
		});

		expect(updateInput).not.toBeNull();
		expect(updateInput?.title).toBe("New title");
		expect(updateInput?.description).toBe("New description");
		expect(updateInput?.status).toBe("In Progress");
		expect(updateInput?.priority).toBe("Urgent");
		expect(updateInput?.type).toBe("Epic");
		expect(updateInput?.dueDate).toBeNull();
		expect(updateInput?.labels).toEqual(["existing", "cli"]);
		expect(updateInput?.dependencies).toEqual(["task-2", "3"]);
		expect(updateInput?.references).toEqual(["docs/new.md", "src/cli.ts"]);
		expect(updateInput?.documentation).toEqual(["docs/spec.md"]);
	});

	it("preserves existing list items when appending in a prefilled edit", async () => {
		const existingTask: Task = {
			id: "task-10",
			title: "List round trip",
			status: "To Do",
			createdDate: "2026-02-20",
			labels: ["alpha", "beta"],
			dependencies: [],
			references: [],
			documentation: [],
			rawContent: "",
		};
		const prompt: TaskWizardPromptRunner = async (question) => {
			if (question.name === "labels") {
				expect(question.initial).toBe("alpha\nbeta");
				return { labels: `${question.initial}\ngamma` };
			}
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskEditWizard({ task: existingTask, statuses: ["To Do"], promptImpl: prompt });
		expect(input?.labels).toEqual(["alpha", "beta", "gamma"]);
	});

	it("supports edit picker flow", async () => {
		const prompt = createPromptRunner({
			taskId: "task-2",
		});
		const selected = await pickTaskForEditWizard({
			tasks: [
				{ id: "task-3", title: "Third" },
				{ id: "task-2", title: "Second" },
				{ id: "task-1", title: "First" },
			],
			promptImpl: prompt,
		});

		expect(selected).toBe("task-2");
	});

	it("returns null when wizard is cancelled", async () => {
		const cancelledPrompt: TaskWizardPromptRunner = async () => {
			throw new TaskWizardCancelledError();
		};

		const createInput = await runTaskCreateWizard({
			statuses: ["To Do", "Done"],
			promptImpl: cancelledPrompt,
		});
		expect(createInput).toBeNull();
	});

	it("supports back navigation from step N to N-1 for text prompts", async () => {
		const asked: string[] = [];
		let titleAttempts = 0;
		let descriptionAttempts = 0;
		const prompt: TaskWizardPromptRunner = async (question) => {
			asked.push(question.name);
			if (question.name === "title") {
				titleAttempts += 1;
				return { title: titleAttempts === 1 ? "Initial title" : "Updated title" };
			}
			if (question.name === "description") {
				descriptionAttempts += 1;
				if (descriptionAttempts === 1) {
					return { __wizardNavigation: "previous" };
				}
				return { description: "Updated description" };
			}
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "Done"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.title).toBe("Updated title");
		expect(input?.description).toBe("Updated description");
		expect(asked.slice(0, 4)).toEqual(["title", "description", "title", "description"]);
	});

	it("treats first-step backspace-empty navigation signal as a no-op", async () => {
		let titleAttempts = 0;
		const asked: string[] = [];
		const prompt: TaskWizardPromptRunner = async (question) => {
			asked.push(question.name);
			if (question.name === "title") {
				titleAttempts += 1;
				if (titleAttempts === 1) {
					return { __wizardNavigation: "previous" };
				}
				return { title: "Recovered title" };
			}
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "Done"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.title).toBe("Recovered title");
		expect(asked[0]).toBe("title");
		expect(asked[1]).toBe("title");
	});

	it("uses prompt-level validation for required title and keeps default selected status", async () => {
		const prompt = createPromptRunner({
			title: ["   ", "Validated title"],
			description: "",
			priority: "",
			labels: "",
			references: "",
			documentation: "",
			dependencies: "",
		});

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.title).toBe("Validated title");
		expect(input?.status).toBe("To Do");
	});

	it("uses select prompts for status, priority, and type with create defaults", async () => {
		const questions: Record<
			string,
			{ type: string; message: string; initial?: string; optionsCount: number; optionValues: string[] }
		> = {};
		const prompt: TaskWizardPromptRunner = async (question) => {
			questions[question.name] = {
				type: question.type,
				message: question.message,
				initial: question.initial,
				optionsCount: question.options?.length ?? 0,
				optionValues: (question.options ?? []).map((option) => option.value),
			};
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskCreateWizard({
			statuses: ["Backlog", "To Do", "In Progress", "Done"],
			types: ["Bug", "Epic"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.status).toBe("To Do");
		expect(input?.priority).toBeUndefined();
		expect(questions.status?.type).toBe("select");
		expect(questions.status?.initial).toBe("To Do");
		expect(questions.status?.optionValues).toEqual(["Backlog", "To Do", "In Progress", "Done"]);
		expect((questions.status?.optionsCount ?? 0) > 0).toBe(true);
		expect(questions.priority?.type).toBe("select");
		expect(questions.priority?.initial).toBe("");
		expect((questions.priority?.optionsCount ?? 0) > 0).toBe(true);
		expect(questions.type?.type).toBe("select");
		expect(questions.type?.initial).toBe("");
		expect(questions.type?.optionValues).toEqual(["", "Bug", "Epic"]);
	});

	it("clears an existing type when None is selected", async () => {
		const existingTask: Task = {
			id: "task-9",
			title: "Typed task",
			status: "To Do",
			type: "Epic",
			createdDate: "2026-02-20 12:00",
			labels: [],
			dependencies: [],
			rawContent: "",
		};
		const prompt = createPromptRunner({ type: "" });

		const updateInput = await runTaskEditWizard({
			task: existingTask,
			statuses: ["To Do", "In Progress", "Done"],
			types: ["Bug", "Epic"],
			promptImpl: prompt,
		});

		expect(updateInput?.type).toBe("");
	});

	it("falls back to default statuses and keeps create default on To Do", async () => {
		const promptQuestions: Record<string, { initial?: string; optionValues: string[] }> = {};
		const prompt: TaskWizardPromptRunner = async (question) => {
			promptQuestions[question.name] = {
				initial: question.initial,
				optionValues: (question.options ?? []).map((option) => option.value),
			};
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskCreateWizard({
			statuses: [],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.status).toBe("To Do");
		expect(promptQuestions.status?.initial).toBe("To Do");
		expect(promptQuestions.status?.optionValues).toEqual(["To Do", "In Progress", "Done"]);
	});

	it("labels single-line text limitations clearly", async () => {
		const messages = new Map<string, string>();
		const prompt: TaskWizardPromptRunner = async (question) => {
			messages.set(question.name, question.message);
			return { [question.name]: question.initial ?? "" };
		};

		await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			promptImpl: prompt,
		});

		expect(messages.get("description")).toContain("Shift+Enter not supported");
	});

	it("skips the project prompt entirely when no projects are configured", async () => {
		const asked: string[] = [];
		const prompt: TaskWizardPromptRunner = async (question) => {
			asked.push(question.name);
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.project).toBeUndefined();
		expect(asked).not.toContain("project");
	});

	it("prompts for project with a None option when projects are configured", async () => {
		const questions: Record<string, { type: string; initial?: string; optionValues: string[] }> = {};
		const prompt: TaskWizardPromptRunner = async (question) => {
			questions[question.name] = {
				type: question.type,
				initial: question.initial,
				optionValues: (question.options ?? []).map((option) => option.value),
			};
			return { [question.name]: question.initial ?? "" };
		};

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			projects: ["Web", "API"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.project).toBeUndefined();
		expect(questions.project?.type).toBe("select");
		expect(questions.project?.initial).toBe("");
		expect(questions.project?.optionValues).toEqual(["", "Web", "API"]);
	});

	it("builds create input with configured project canonical casing", async () => {
		const prompt = createPromptRunner({
			title: "Projected task",
			description: "",
			priority: "",
			type: "",
			project: "web",
			labels: "",
			references: "",
			documentation: "",
			dependencies: "",
		});

		const input = await runTaskCreateWizard({
			statuses: ["To Do", "In Progress", "Done"],
			projects: ["Web", "API"],
			promptImpl: prompt,
		});

		expect(input).not.toBeNull();
		expect(input?.project).toBe("Web");
	});

	it("clears an existing project when None is selected", async () => {
		const existingTask: Task = {
			id: "task-9",
			title: "Projected task",
			status: "To Do",
			project: "API",
			createdDate: "2026-02-20 12:00",
			labels: [],
			dependencies: [],
			rawContent: "",
		};
		const prompt = createPromptRunner({ project: "" });

		const updateInput = await runTaskEditWizard({
			task: existingTask,
			statuses: ["To Do", "In Progress", "Done"],
			projects: ["Web", "API"],
			promptImpl: prompt,
		});

		expect(updateInput?.project).toBe("");
	});
});
