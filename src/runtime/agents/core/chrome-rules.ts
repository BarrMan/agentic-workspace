import type { AgentChromeRule } from "./agent.ts";

/** Shared chrome across every provider: an interrupt hint means work is happening. */
const INTERRUPT_RUNNING: AgentChromeRule = {
	pattern: /esc to interrupt|ctrl\+c to interrupt|esc to cancel/i,
	activity: "running",
};
const ERROR_CHROME: AgentChromeRule = { pattern: /(?:^|\n)\s*(?:error|api error|fatal):/i, activity: "error" };
const IDLE_PROMPT: AgentChromeRule = { pattern: /(?:^|\n)\s*[>›]\s*$/m, activity: "idle" };

/** Per-adapter rules, ordered most specific first; the first match wins. */
export const CLAUDE_CHROME_RULES: readonly AgentChromeRule[] = [
	ERROR_CHROME,
	{ pattern: /do you want to proceed\?|❯\s*1\.\s*yes|waiting for your (?:input|approval)/i, activity: "waiting" },
	INTERRUPT_RUNNING,
	IDLE_PROMPT,
];

export const OPENCODE_CHROME_RULES: readonly AgentChromeRule[] = [
	ERROR_CHROME,
	{ pattern: /permission (?:required|asked)|allow this tool/i, activity: "waiting" },
	INTERRUPT_RUNNING,
	IDLE_PROMPT,
];

// Pi auto-approves, so it never shows a permission chrome; it can still be interrupted.
export const PI_CHROME_RULES: readonly AgentChromeRule[] = [ERROR_CHROME, INTERRUPT_RUNNING, IDLE_PROMPT];
