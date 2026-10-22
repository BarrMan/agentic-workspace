import { ClaudeAgent } from "./claude/claude.ts";
import { HarnessRegistry } from "./core/agents.ts";
import { OpencodeV1Agent } from "./opencode/opencode-v1.ts";
import { OpencodeV2Agent } from "./opencode/opencode-v2.ts";
import { PiAgent } from "./pi/pi.ts";

class HarnessStartup {
	static create(): HarnessRegistry {
		return new HarnessRegistry([new ClaudeAgent(), new OpencodeV1Agent(), new OpencodeV2Agent(), new PiAgent()]);
	}
}

export const harnessRegistry = HarnessStartup.create();
