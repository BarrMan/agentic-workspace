export interface CapturableProcess {
	exited: Promise<number>;
	stdout?: ReadableStream<Uint8Array> | null;
	stderr?: ReadableStream<Uint8Array> | null;
}

export interface CapturedProcessOutput {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export async function captureProcessOutput(process: CapturableProcess): Promise<CapturedProcessOutput> {
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		process.stdout ? new Response(process.stdout).text() : Promise.resolve(""),
		process.stderr ? new Response(process.stderr).text() : Promise.resolve(""),
	]);
	return { exitCode, stdout, stderr };
}
