export interface CreatedTaskWrite {
	filePath: string;
	createdContent: Buffer;
	previousPath: string | null;
	previousContent: Buffer | null;
}

export interface CreatedTaskRollbackResult {
	workingPathRestored: boolean;
}
