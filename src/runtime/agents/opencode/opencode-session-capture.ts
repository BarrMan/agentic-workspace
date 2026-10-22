import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { processIdentity, terminateProcessTree } from "../../../lib/process-tree.ts";
import type { AgentPreset } from "../../../model/session/types.ts";

const READY_TIMEOUT_MS = 6_000;

/** Owns the short-lived, project-local OpenCode server used for session preassignment. */
export class OpenCodeSessionCapture {
	async preassignSession(
		preset: AgentPreset,
		cwd: string,
		env: Record<string, string>,
		signal?: AbortSignal,
	): Promise<string> {
		const id = `ses_${randomUUID()}`;
		const password = randomUUID();
		const port = await reservePort();
		const child = Bun.spawn([...preset.command, "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
			cwd,
			env: { ...env, OPENCODE_PASSWORD: password },
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
			detached: true,
		});
		let expectedIdentity: ReturnType<typeof processIdentity>;
		const base = `http://127.0.0.1:${port}`;
		const headers = { authorization: `Basic ${btoa(`opencode:${password}`)}` };
		let result: string | undefined;
		const failures: unknown[] = [];
		try {
			expectedIdentity = processIdentity(child.pid);
			if (!expectedIdentity) throw new Error(`Could not inspect OpenCode serve process identity for PID ${child.pid}.`);
		} catch (error) {
			failures.push(error);
		}
		if (expectedIdentity) {
			try {
				const deadline = Date.now() + READY_TIMEOUT_MS;
				let ready = false;
				while (Date.now() < deadline) {
					signal?.throwIfAborted();
					try {
						const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
						const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
						const response = await fetch(`${base}/api/session`, { headers, signal: requestSignal });
						if (response.ok) {
							ready = true;
							break;
						}
					} catch (error) {
						if (signal?.aborted) throw error;
					}
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				if (!ready) throw new Error("OpenCode serve did not become ready within 6 seconds.");
				// A shell launcher may exec the server; pin its ready identity while the owned child is still live.
				if (child.exitCode !== null) throw new Error("OpenCode serve exited before identity acquisition.");
				const readyIdentity = processIdentity(child.pid);
				if (!readyIdentity)
					throw new Error(`Could not inspect ready OpenCode serve process identity for PID ${child.pid}.`);
				expectedIdentity = readyIdentity;
				signal?.throwIfAborted();
				const postTimeout = AbortSignal.timeout(2_000);
				const response = await fetch(`${base}/api/session`, {
					method: "POST",
					headers: { ...headers, "content-type": "application/json" },
					body: JSON.stringify({ id, location: { directory: cwd } }),
					signal: signal ? AbortSignal.any([signal, postTimeout]) : postTimeout,
				});
				if (!response.ok) throw new Error(`OpenCode session preassignment returned HTTP ${response.status}.`);
				const data: unknown = await response.json();
				if ((data as { data?: { id?: unknown } } | null)?.data?.id !== id)
					throw new Error(`OpenCode session preassignment did not confirm requested ID '${id}'.`);
				result = id;
			} catch (error) {
				failures.push(error);
			}
		}
		if (expectedIdentity) {
			try {
				const outcome = await terminateProcessTree(child.pid, 150, expectedIdentity);
				if (outcome === "terminated" || outcome === "killed") await child.exited;
				else if (outcome === "survivor") failures.push(new Error("OpenCode serve process tree survived cleanup."));
				else failures.push(new Error("OpenCode serve process disappeared before cleanup completed."));
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1) throw new AggregateError(failures, "OpenCode session capture and cleanup failed.");
		return result!;
	}
}

async function reservePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Could not reserve an OpenCode serve port.");
	await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	return address.port;
}
