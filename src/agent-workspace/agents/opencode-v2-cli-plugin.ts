import { join } from "node:path";

export function createOpencodeV2CliPlugin(options: {
	metadataRoot: string;
	agenticWorkspaceSessionId: string;
	statusDir?: string;
}): string {
	return `import { Plugin } from "@opencode/plugin/tui";
import { mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const SIDECAR = ${JSON.stringify(join(options.metadataRoot, `${options.agenticWorkspaceSessionId}.native-session-id`))};
const PROMPT_ACCEPTED = ${JSON.stringify(join(options.metadataRoot, `${options.agenticWorkspaceSessionId}.prompt-accepted`))};
const STATUS = ${JSON.stringify(options.statusDir ? join(options.statusDir, "status") : "")};
let writeSequence = 0;

function atomicWrite(path, value) {
  if (!path) return;
  const temp = path + "." + process.pid + "." + (++writeSequence) + ".tmp";
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(temp, value, { mode: 0o600 });
    renameSync(temp, path);
  } catch {
    try { rmSync(temp, { force: true }); } catch {}
  }
}

export default Plugin.define({
  id: "agentic-workspace-session-status",
  setup(ctx) {
    const activeRoute = () => {
      try {
        const route = ctx.ui.router.current();
        return route && route.type === "session" && typeof route.sessionID === "string" &&
          /^ses_[A-Za-z0-9_-]+$/.test(route.sessionID) ? route : undefined;
      } catch { return undefined; }
    };
    const receipt = (sessionID) => {
      try {
        const route = activeRoute();
        if (route && sessionID === route.sessionID) atomicWrite(SIDECAR, sessionID);
      } catch {}
    };
    const status = (event, value) => {
      try {
        const data = event && event.data;
        const route = activeRoute();
        if (STATUS && route && data && data.sessionID === route.sessionID) atomicWrite(STATUS, value);
      } catch {}
    };
    const cleanup = [];
    try {
      const dispose = ctx.ui.slot({ append: "app", render: () => {
        try {
          const route = activeRoute();
          if (route) receipt(route.sessionID);
        } catch {}
        return null;
      } });
      if (typeof dispose === "function") cleanup.push(dispose);
    } catch {}
    try {
      for (const [name, value] of [
        ["session.execution.started", "running"],
        ["session.execution.succeeded", "idle"],
        ["session.execution.failed", "error"],
        ["permission.asked", "waiting"],
      ]) {
        const dispose = ctx.data.on(name, (event) => { status(event, value); });
        if (typeof dispose === "function") cleanup.push(dispose);
      }
      const messageDispose = ctx.data.on("message.updated", (event) => {
        try {
          const info = event && event.data && event.data.info;
          const route = activeRoute();
          if (route && info && info.sessionID === route.sessionID && info.role === "user") atomicWrite(PROMPT_ACCEPTED, info.sessionID);
        } catch {}
      });
      if (typeof messageDispose === "function") cleanup.push(messageDispose);
    } catch {}
    return () => { for (const dispose of cleanup) { try { dispose(); } catch {} } };
  },
});
`;
}
