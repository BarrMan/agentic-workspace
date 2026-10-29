import type { InsertedTaskState } from "./session-store.ts";

export interface CreatedTaskWrite {
	filePath: string;
	createdContent: Buffer;
	createdDirectories: string[];
	previousPath: string | null;
	previousContent: Buffer | null;
	sessionState?: InsertedTaskState;
}

export interface CreatedTaskRollbackResult {
	workingPathRestored: boolean;
	sessionStateRestored: boolean;
}
