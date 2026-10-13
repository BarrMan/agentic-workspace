/**
 * Interface for loading screens that can be updated with progress messages.
 */
export interface LoadingScreen {
	/** Update the loading screen with a new progress message */
	update: (message: string) => void;
	/** Close the loading screen and clean up resources */
	close: () => void;
}

const SPINNER_CHARS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 100;

/**
 * Create a loading screen that can be updated with progress messages.
 *
 * On a TTY this renders a single-line spinner on stderr so it never mixes with command output.
 * Without a TTY it degrades to plain line logging.
 */
export async function createLoadingScreen(initialMessage: string): Promise<LoadingScreen | null> {
	const isTTY = Boolean(process.stderr.isTTY);
	let closed = false;
	let spinnerIndex = 0;
	let message = initialMessage;
	let timer: NodeJS.Timeout | null = null;

	const paint = () => {
		if (!isTTY || closed) return;
		process.stderr.write(`\r\u001B[2K${SPINNER_CHARS[spinnerIndex]} ${message}`);
	};

	const stopTimer = () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	};

	if (isTTY) {
		paint();
		timer = setInterval(() => {
			spinnerIndex = (spinnerIndex + 1) % SPINNER_CHARS.length;
			paint();
		}, SPINNER_INTERVAL_MS);
	} else {
		console.log(`${initialMessage}...`);
	}

	return {
		update: (next: string) => {
			if (closed) return;
			message = next;
			if (isTTY) paint();
			else console.log(`  ${next}...`);
		},
		close: () => {
			if (closed) return;
			closed = true;
			stopTimer();
			if (isTTY) process.stderr.write("\r\u001B[2K");
		},
	};
}
