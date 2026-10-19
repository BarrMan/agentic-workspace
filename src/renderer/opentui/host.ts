import { BoxRenderable, type CliRenderer, createCliRenderer } from "@opentui/core";

export type OpenTuiHost = {
	readonly renderer: CliRenderer;
	readonly root: BoxRenderable;
	destroy(): void;
};

/** Own one complete OpenTUI alternate-screen session and its retained root. */
export async function createOpenTuiHost(): Promise<OpenTuiHost> {
	const renderer = await createCliRenderer({
		exitOnCtrlC: false,
		// Every signal here takes the renderer's graceful destroy path instead of the process's
		// default immediate termination. That path is what lets the workspace stop its owned tmux
		// servers and native agents; an unhandled SIGINT would strand those daemons on exit.
		exitSignals: ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"],
		targetFps: 30,
		maxFps: 60,
	});
	let root: BoxRenderable | undefined;
	try {
		root = new BoxRenderable(renderer, {
			width: "100%",
			height: "100%",
			flexDirection: "column",
		});
		renderer.root.add(root);
	} catch (error) {
		try {
			try {
				root?.destroyRecursively();
			} finally {
				renderer.destroy();
			}
		} catch {
			// Preserve the startup failure even if cleanup also fails.
		}
		throw error;
	}
	const retainedRoot = root;
	let destroyed = false;
	renderer.once("destroy", () => {
		destroyed = true;
	});
	return {
		renderer,
		root: retainedRoot,
		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			try {
				retainedRoot.destroyRecursively();
			} finally {
				renderer.destroy();
			}
		},
	};
}
