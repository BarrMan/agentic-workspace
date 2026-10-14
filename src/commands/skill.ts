import type { Command } from "commander";
import { AGENTIC_WORKSPACE_TASK_SKILL } from "../agent-workspace/task-skill.ts";

export function registerSkillCommand(program: Command): void {
	program
		.command("skill")
		.description("print the session-local AgenticWorkspace task management skill")
		.action(() => {
			process.stdout.write(AGENTIC_WORKSPACE_TASK_SKILL);
		});
}
