import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenCodeSessionCapture } from "./opencode-session-capture.ts";

describe("OpenCode provider-owned session capture", () => {
	it("precreates the selected ID once and stops and awaits serve on success and mismatch", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-capture-"));
		try {
			const executable = await fakeOpenCode(directory);
			for (const mode of ["success", "mismatch"]) {
				const requests = join(directory, `${mode}.requests`);
				const stopped = join(directory, `${mode}.stopped`);
				const env = {
					PATH: process.env.PATH ?? "",
					CAPTURE_MODE: mode,
					CAPTURE_REQUESTS: requests,
					CAPTURE_STOPPED: stopped,
				};
				const capture = new OpenCodeSessionCapture();
				if (mode === "mismatch") {
					await expect(capture.preassignSession(preset(executable), directory, env)).rejects.toThrow(
						"did not confirm requested ID",
					);
				} else {
					const id = await capture.preassignSession(preset(executable), directory, env);
					expect(id).toMatch(/^ses_[0-9a-f-]{36}$/);
				}
				const lines = (await readFile(requests, "utf8"))
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line));
				expect(lines.filter((line) => line.method === "POST")).toHaveLength(1);
				const post = lines.find((line) => line.method === "POST");
				expect(post.body.id).toMatch(/^ses_[0-9a-f-]{36}$/);
				expect(post.body.location.directory).toBe(directory);
				expect(post.authorization).toMatch(/^Basic /);
				expect(await readFile(stopped, "utf8")).toBe("stopped");
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("stops and awaits serve when readiness times out", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-capture-timeout-"));
		try {
			const executable = await fakeOpenCode(directory);
			const stopped = join(directory, "timeout.stopped");
			await expect(
				new OpenCodeSessionCapture().preassignSession(preset(executable), directory, {
					PATH: process.env.PATH ?? "",
					CAPTURE_MODE: "timeout",
					CAPTURE_STOPPED: stopped,
				}),
			).rejects.toThrow("did not become ready within 6 seconds");
			expect(await readFile(stopped, "utf8")).toBe("stopped");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}, 10_000);

	it("terminates a server spawned beneath a package-runner wrapper", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-capture-wrapper-"));
		try {
			const executable = await fakeOpenCode(directory);
			const wrapper = join(directory, "package-runner");
			const requests = join(directory, "wrapper.requests");
			await writeFile(
				wrapper,
				`const child = Bun.spawn([${JSON.stringify(process.execPath)}, ${JSON.stringify(executable)}, ...process.argv.slice(2)], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore" });\nawait child.exited;\n`,
			);
			await new OpenCodeSessionCapture().preassignSession(preset(wrapper), directory, {
				PATH: process.env.PATH ?? "",
				CAPTURE_MODE: "success",
				CAPTURE_STOPPED: join(directory, "wrapper.stopped"),
				CAPTURE_REQUESTS: requests,
			});
			expect((await readFile(requests, "utf8")).trim().split("\n")).toHaveLength(2);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

const preset = (executable: string) => ({
	command: [process.execPath, executable],
	env: {},
	prepare: "",
	bootstrap: "opencode" as const,
});

async function fakeOpenCode(directory: string): Promise<string> {
	const executable = join(directory, "opencode");
	await writeFile(
		executable,
		`#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const record = (value) => appendFileSync(process.env.CAPTURE_REQUESTS, JSON.stringify(value) + "\\n");
process.on("SIGTERM", () => { appendFileSync(process.env.CAPTURE_STOPPED, "stopped"); server?.stop(true); process.exit(0); });
let server;
if (process.env.CAPTURE_MODE !== "timeout") server = Bun.serve({ hostname: "127.0.0.1", port, async fetch(request) {
  const method = request.method;
  const body = method === "POST" ? await request.json() : {};
  record({ method, authorization: request.headers.get("authorization"), body });
  const id = process.env.CAPTURE_MODE === "mismatch" ? "ses_wrong" : body.id;
  return Response.json({ data: { id } });
} });
setInterval(() => {}, 1000);
`,
	);
	await chmod(executable, 0o700);
	return executable;
}
