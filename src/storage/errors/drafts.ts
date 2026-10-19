export class DraftParseError extends Error {
	constructor(filename: string) {
		super(`Draft file ${filename} could not be parsed. Repair or remove the file, then rerun the edit.`);
		this.name = "DraftParseError";
	}
}

export class DraftIdentityError extends Error {
	constructor(filename: string, frontmatterId: string, filenameId: string | null) {
		super(
			`Draft file ${filename} declares frontmatter id ${frontmatterId}, which does not match its filename id ${filenameId ?? "(unreadable)"}. Fix the frontmatter id or rename the file so they agree, then rerun the edit.`,
		);
		this.name = "DraftIdentityError";
	}
}
