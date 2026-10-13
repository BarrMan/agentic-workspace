import cliAgentNudgeContent from "./cli-agent-nudge.md" with { type: "text" };
import mcpAgentNudgeContent from "./mcp/agent-nudge.md" with { type: "text" };

export const CLI_AGENT_NUDGE = cliAgentNudgeContent.trim();
export const README_GUIDELINES = `## AI Agent Guidelines\n\n${CLI_AGENT_NUDGE}`;
export const MCP_AGENT_NUDGE = mcpAgentNudgeContent;
