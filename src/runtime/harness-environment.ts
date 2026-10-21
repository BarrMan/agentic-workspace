type WorkspacePaths = {
	AGENTIC_WORKSPACE_PROJECT_DIR: string;
	AGENTIC_WORKSPACE_WORKTREE_DIR: string;
	AGENTIC_WORKSPACE_TASK_DIR: string;
};

type EnvironmentOptions = {
	inherited?: NodeJS.ProcessEnv;
	childEnv?: Record<string, string>;
	onWarning?: (text: string) => void;
};

function rejectPresetValue(message: string, options: EnvironmentOptions): never {
	options.onWarning?.(message);
	throw new Error(message);
}

function substituteWorkspacePaths(
	name: string,
	value: string,
	paths: WorkspacePaths,
	options: EnvironmentOptions,
): string {
	let result = "";
	for (let index = 0; index < value.length; ) {
		if (value[index] === "\\" && value[index + 1] === "$") {
			result += "$";
			index += 2;
			continue;
		}
		if (value[index] !== "$") {
			result += value[index];
			index += 1;
			continue;
		}

		let reference: string | undefined;
		if (value[index + 1] === "{") {
			const end = value.indexOf("}", index + 2);
			if (end < 0) {
				return rejectPresetValue(`Preset variable ${name} may reference only workspace paths.`, options);
			}
			reference = value.slice(index + 2, end);
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference)) {
				return rejectPresetValue(`Preset variable ${name} may reference only workspace paths.`, options);
			}
			index = end + 1;
		} else {
			const match = value.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
			if (!match) {
				return rejectPresetValue(`Preset variable ${name} may reference only workspace paths.`, options);
			}
			reference = match[0];
			index += reference.length + 1;
		}

		if (!Object.hasOwn(paths, reference)) {
			return rejectPresetValue(`Preset variable ${name} may reference only workspace paths.`, options);
		}
		result += paths[reference as keyof WorkspacePaths];
	}
	if (result.includes("\0")) return rejectPresetValue(`Preset variable ${name} contains a NUL byte.`, options);
	return result;
}

export async function prepareHarnessEnvironment(
	presetEnv: Record<string, string>,
	paths: { projectDir: string; worktreeDir: string; taskDir: string },
	options: EnvironmentOptions = {},
): Promise<Record<string, string>> {
	const workspacePaths: WorkspacePaths = {
		AGENTIC_WORKSPACE_PROJECT_DIR: paths.projectDir,
		AGENTIC_WORKSPACE_WORKTREE_DIR: paths.worktreeDir,
		AGENTIC_WORKSPACE_TASK_DIR: paths.taskDir,
	};
	const effective: Record<string, string> = {};
	for (const [name, value] of Object.entries(options.inherited ?? process.env))
		if (value !== undefined) effective[name] = value;

	for (const [name, value] of Object.entries(presetEnv)) {
		if (Object.hasOwn(workspacePaths, name)) {
			return rejectPresetValue(`Preset cannot override reserved workspace path ${name}.`, options);
		}
		effective[name] = substituteWorkspacePaths(name, value, workspacePaths, options);
	}

	Object.assign(effective, options.childEnv, workspacePaths);
	return effective;
}
