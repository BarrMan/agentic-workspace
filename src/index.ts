export { Core } from "./controller/agentic-workspace.ts";

import { Core } from "./controller/agentic-workspace.ts";
import { Session } from "./model/session/session.ts";
import type { SessionFactory } from "./model/session/types.ts";
import { Harness } from "./runtime/harness.ts";
import { BunRunner, SessionProcess } from "./runtime/session-process.ts";
import { HarnessSessionRuntime } from "./runtime/session-runtime.ts";
import { Storage } from "./storage/storage.ts";

/** Compose one Core and its SessionRuntime so renderer attachments share session execution. */
export async function createApplication(projectRoot: string, options: { maxSessions?: number } = {}) {
	const storage = Storage.open(projectRoot);
	const runner = new BunRunner();
	const process = new SessionProcess(runner, {
		projectRoot,
		stateRoot: async () => storage.sessionStore().stateRoot,
	});
	const sessionRuntime = new HarnessSessionRuntime(new Harness(projectRoot, process), process, runner);
	const sessionFactory: SessionFactory = (_taskId, modeId, record) => {
		if (!record) throw new Error("SessionFactory requires a durable session record.");
		return new Session(record, modeId, sessionRuntime);
	};
	const core = new Core(projectRoot, { storage, sessionFactory, maxSessions: options.maxSessions });
	await core.tasks.init();
	return { core, sessionRuntime };
}
