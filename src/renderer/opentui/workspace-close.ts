export async function settleWorkspaceClose(options: {
	readonly hasWorkingSessions: boolean;
	readonly confirm: () => Promise<boolean>;
	readonly settlePending: () => Promise<void>;
	readonly shutdown: () => Promise<void>;
	readonly close: (mode: "force" | "keep") => Promise<void>;
}): Promise<"force" | "keep"> {
	if (!options.hasWorkingSessions || !(await options.confirm())) {
		await options.close("keep");
		return "keep";
	}
	await options.settlePending();
	await options.shutdown();
	await options.close("force");
	return "force";
}
