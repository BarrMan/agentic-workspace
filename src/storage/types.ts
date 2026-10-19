import type { Task, TaskDirectoryType } from "../model/types.ts";

export interface CreatedTaskWrite {
	filePath: string;
	createdContent: Buffer;
	previousPath: string | null;
	previousContent: Buffer | null;
}

export interface CreatedTaskRollbackResult {
	workingPathRestored: boolean;
}

export interface BranchTaskStateEntry {
	id: string;
	type: TaskDirectoryType;
	lastModified: Date;
	branch: string;
	path: string;
	task?: Task;
}
