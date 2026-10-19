import type { Agent } from "./agent.ts";
import { ClaudeAgent } from "./claude.ts";
import { OpencodeV1Agent } from "./opencode-v1.ts";
import { OpencodeV2Agent } from "./opencode-v2.ts";
import { PiAgent } from "./pi.ts";

const registry = new Map<string, Agent>();

export function registerAgent(agent: Agent): void {
	registry.set(agent.name, agent);
}

export function agentFor(name: string): Agent | undefined {
	return registry.get(name);
}

export function builtInAgents(): Agent[] {
	return [new OpencodeV1Agent(), new OpencodeV2Agent(), new ClaudeAgent(), new PiAgent()];
}

for (const agent of builtInAgents()) registerAgent(agent);
