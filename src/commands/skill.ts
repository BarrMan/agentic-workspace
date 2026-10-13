import type { Command } from "commander";
import { BACKLOG_TASK_SKILL } from "../agent-workspace/task-skill.ts";

export function registerSkillCommand(program: Command): void {
	program
		.command("skill")
		.description("print the session-local Backlog task management skill")
		.action(() => {
			process.stdout.write(BACKLOG_TASK_SKILL);
		});
}
