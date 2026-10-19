export class FrontmatterSchemaError extends Error {}

export class TaskFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(taskId: string, detail: string) {
		super(`Invalid task frontmatter for ${taskId || "(missing id)"}: ${detail}.`);
		this.name = "TaskFrontmatterSchemaError";
	}
}

export class UnsupportedTaskFrontmatterSchemaError extends FrontmatterSchemaError {
	/** The version the payload declared; `undefined` means the payload predates versioning. */
	readonly version: unknown;

	constructor(taskId: string, version: unknown) {
		super(
			version === undefined
				? `Task ${taskId || "(missing id)"} has no task frontmatter schema version.`
				: `Task ${taskId || "(missing id)"} uses unsupported task frontmatter schema version ${JSON.stringify(version)}.`,
		);
		this.name = "UnsupportedTaskFrontmatterSchemaError";
		this.version = version;
	}
}

export class UnsupportedRecordFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(kind: "milestone", id: string, version: unknown) {
		super(
			`${kind[0]?.toUpperCase()}${kind.slice(1)} ${id || "(missing id)"} uses unsupported ${kind} frontmatter schema version ${JSON.stringify(version)}.`,
		);
		this.name = "UnsupportedRecordFrontmatterSchemaError";
	}
}

export class TaskDependenciesParseError extends Error {
	constructor(taskId: string, entryIndex?: number) {
		const location = entryIndex === undefined ? "the field" : `entry ${entryIndex + 1}`;
		super(
			`Invalid dependencies in task ${taskId || "(missing id)"}: ${location} contains a mapping or nested list. Use a list of task IDs in the task Markdown.`,
		);
		this.name = "TaskDependenciesParseError";
	}
}
