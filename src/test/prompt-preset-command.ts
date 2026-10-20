import { shellQuote } from "../runtime/agents/core/agent.ts";

export function expandPromptPresetCommand(command: string[], prompt: string): string {
	return command
		.map((arg) =>
			arg
				.split(/(\{prompt\}|\{instructions\})/)
				.map((part) => (part === "{prompt}" || part === "{instructions}" ? prompt : shellQuote(part)))
				.join(""),
		)
		.join(" ");
}
