import { afterEach, describe, expect, it } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./migrate-task-directory.ts", import.meta.url).pathname;
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "migrate-task-directory-"));
	roots.push(root);
	return root;
}

function run(root: string) {
	return Bun.spawnSync([process.execPath, script, root], { timeout: 10_000 });
}

describe("migrate-task-directory script", () => {
	it("moves the whole directory without changing arbitrary file bytes", async () => {
		const root = await project();
		const source = join(root, "agentic-workspace");
		const nested = join(source, "nested");
		const bytes = Buffer.from([0, 255, 1, 128]);
		await mkdir(nested, { recursive: true });
		await writeFile(join(nested, "opaque.bin"), bytes);
		const result = run(root);

		expect(result.exitCode).toBe(0);
		expect(await readFile(join(root, ".agentic-workspace", "nested", "opaque.bin"))).toEqual(bytes);
		await expect(lstat(source)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("refuses missing, non-directory, and symlink sources", async () => {
		const root = await project();
		expect(run(root).exitCode).toBe(1);
		await writeFile(join(root, "agentic-workspace"), "source");
		expect(run(root).stderr.toString()).toContain("not a real directory");
		await rm(join(root, "agentic-workspace"));
		await symlink("missing-target", join(root, "agentic-workspace"));
		expect(run(root).stderr.toString()).toContain("not a real directory");
	});

	it("refuses every existing destination without changing either directory", async () => {
		for (const kind of ["directory", "file", "dangling-symlink"] as const) {
			const root = await project();
			const source = join(root, "agentic-workspace");
			const destination = join(root, ".agentic-workspace");
			await mkdir(source);
			await writeFile(join(source, "kept"), "source bytes");
			if (kind === "directory") await mkdir(destination);
			if (kind === "file") await writeFile(destination, "destination bytes");
			if (kind === "dangling-symlink") await symlink("missing-target", destination);

			const result = run(root);
			expect(result.exitCode).toBe(1);
			expect(result.stderr.toString()).toContain("already exists");
			expect(await readFile(join(source, "kept"), "utf8")).toBe("source bytes");
			if (kind === "file") expect(await readFile(destination, "utf8")).toBe("destination bytes");
			if (kind === "dangling-symlink") expect((await lstat(destination)).isSymbolicLink()).toBe(true);
		}
	});
});
