import { type CliRenderer, EmbeddedTerminalRenderable, KeyEvent } from "@opentui/core";
import type { AgentHost } from "../../agent-workspace/live/agent-host.ts";

class WorkspaceAgentTerminal extends EmbeddedTerminalRenderable {
	override encodeKey(key: KeyEvent): Uint8Array {
		// OpenTUI's native embedded-terminal encoder drops the ESC prefix for
		// Alt/Option plus a printable character and returns empty for SS3
		// arrows, so it cannot reconstruct those bytes. Forward the original raw
		// sequence in those cases. Otherwise normalize only the public metadata
		// mismatch (Alt parses as `meta`, Kitty Alt as both `meta` and
		// `option`, and the encoder interprets `meta` as Super); the native
		// encoder still owns all other bytes, terminal modes, and Backspace
		// versus forward Delete. Never mutate the incoming event.
		const isAlt = key.meta && (key.source === "raw" || key.option);
		const { sequence } = key;
		// Historical Meta plus one printable ASCII byte, e.g. iTerm2's Option+Left/Right.
		const isPrintableAlt =
			isAlt &&
			sequence.length === 2 &&
			sequence.charCodeAt(0) === 0x1b &&
			sequence.charCodeAt(1) >= 0x20 &&
			sequence.charCodeAt(1) <= 0x7e;
		if (isPrintableAlt) return new TextEncoder().encode(sequence);
		// Historical SS3 arrows (`ESC O A`-`ESC O D`) encode to empty in the native encoder.
		const isSs3Arrow =
			sequence.length === 3 &&
			sequence.charCodeAt(0) === 0x1b &&
			sequence.charCodeAt(1) === 0x4f &&
			sequence.charCodeAt(2) >= 0x41 &&
			sequence.charCodeAt(2) <= 0x44;
		if (isSs3Arrow) return new TextEncoder().encode(sequence);
		if (isAlt) {
			return super.encodeKey(new KeyEvent({ ...key, meta: false, option: true }));
		}
		return super.encodeKey(key);
	}
}

/** One native terminal per agent, retained even when its workspace view is detached. */
export function createWorkspaceAgent(
	renderer: CliRenderer,
	host: AgentHost,
	columns: number,
	rows: number,
	onError: (error: Error) => void,
): EmbeddedTerminalRenderable {
	return new WorkspaceAgentTerminal(renderer, {
		cols: columns,
		rows,
		width: "100%",
		height: "100%",
		minWidth: 0,
		minHeight: 0,
		overflow: "hidden",
		maxScrollback: 2000,
		transparentBackground: true,
		onData: (bytes, source) => {
			// tmux already answers terminal queries. Sending the mirror's responses
			// would duplicate replies and corrupt interactive application input.
			if (source === "input") host.sendBytes(bytes);
		},
		onTerminalResize: (cols, height) => {
			void host.resize(cols, height).catch((error: unknown) => {
				onError(error instanceof Error ? error : new Error(String(error)));
			});
		},
	});
}
