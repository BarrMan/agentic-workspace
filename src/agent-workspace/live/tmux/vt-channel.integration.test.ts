import { expect, it } from "bun:test";
import { createTmuxExec } from "./exec.ts";
import { createVtChannel } from "./vt-channel.ts";

it("uses a private test-owned tmux server and attaches to an existing pane", async () => {
	const socketName = `vt-it-${process.pid}-${crypto.randomUUID().replaceAll("-", "")}`;
	const exec = createTmuxExec({ socketName, timeoutMs: 2_000 });
	const session = `vt-it-${crypto.randomUUID().replaceAll("-", "")}`;
	let channel: Awaited<ReturnType<typeof createVtChannel>> = null;
	let output = "";
	try {
		const started = await exec.run(["new-session", "-d", "-s", session, "-x", "80", "-y", "24"]);
		expect(started.exitCode).toBe(0);
		const pane = await exec.run(["display-message", "-p", "-t", session, "#{pane_id}"]);
		channel = await createVtChannel({
			socketName,
			exec,
			paneId: pane.stdout.trim(),
			onOutput: (bytes) => (output += Buffer.from(bytes).toString()),
			ownerId: crypto.randomUUID(),
		});
		expect(channel).not.toBeNull();
		await exec.run(["send-keys", "-t", pane.stdout.trim(), "printf VT_EXISTING_PANE_OK", "Enter"]);
		const deadline = Date.now() + 2_500;
		while (!output.includes("VT_EXISTING_PANE_OK") && Date.now() < deadline) await Bun.sleep(10);
		expect(output).toContain("VT_EXISTING_PANE_OK");
	} finally {
		await channel?.dispose();
		const killed = await exec.run(["kill-server"]);
		expect(killed.exitCode === 0 || /no server running/i.test(killed.stderr)).toBe(true);
	}
});
