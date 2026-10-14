import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..", ".agentic-workspace");
const obsoleteSessionFields = ["presetSnapshot", "configScope", "createdWith", "predecessorId"];

for (const entry of await readdir(root, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const path = join(root, entry.name, "state.json");
	let state: unknown;
	try {
		state = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
		throw error;
	}
	if (typeof state !== "object" || state === null || Array.isArray(state))
		throw new Error(`Invalid session state object at ${path}`);
	const modes = (state as Record<string, unknown>).modes;
	if (typeof modes !== "object" || modes === null || Array.isArray(modes))
		throw new Error(`Invalid session modes at ${path}`);
	let changed = false;
	for (const history of Object.values(modes)) {
		if (typeof history !== "object" || history === null || Array.isArray(history))
			throw new Error(`Invalid session history at ${path}`);
		const sessions = (history as Record<string, unknown>).sessions;
		if (!Array.isArray(sessions)) throw new Error(`Invalid sessions at ${path}`);
		for (const session of sessions) {
			if (typeof session !== "object" || session === null || Array.isArray(session))
				throw new Error(`Invalid session record at ${path}`);
			for (const field of obsoleteSessionFields) {
				if (Object.hasOwn(session, field)) {
					delete (session as Record<string, unknown>)[field];
					changed = true;
				}
			}
		}
	}
	if (changed) await writeFile(path, `${JSON.stringify(state, null, "\t")}\n`);
}
