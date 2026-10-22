export const isMissingTmuxTarget = (output: string): boolean =>
	/no server running|can't find pane|\(no such file or directory\)|\(connection refused\)/i.test(output);
