#!/usr/bin/env bash
# Bash completion script for agentic-workspace CLI
#
# NOTE: This script is embedded in the agentic-workspace binary and installed automatically
# via 'agentic-workspace completion install'. This file serves as reference documentation.
#
# Installation:
#   - Recommended: agentic-workspace completion install --shell bash
#   - Manual: Copy to /etc/bash_completion.d/agentic-workspace
#   - Or source directly in ~/.bashrc: source /path/to/agentic-workspace.bash
#
# Requirements:
#   - Bash 3.2 or later
#   - bash-completion package (optional but recommended)

# Main completion function for agentic-workspace CLI
_agentic-workspace() {
	# Initialize completion variables using bash-completion helper if available
	# Falls back to manual initialization if bash-completion is not installed
	local cur prev words cword
	if declare -F _init_completion >/dev/null 2>&1; then
		_init_completion || return
	else
		# Manual initialization fallback
		COMPREPLY=()
		cur="${COMP_WORDS[COMP_CWORD]}"
		prev="${COMP_WORDS[COMP_CWORD-1]}"
		words=("${COMP_WORDS[@]}")
		cword=$COMP_CWORD
	fi

	# Get the full command line and cursor position
	local line="${COMP_LINE}"
	local point="${COMP_POINT}"

	# Call the CLI's internal completion command
	# This delegates all completion logic to the TypeScript implementation
	# Output format: one completion per line
	local completions
	completions=$(agentic-workspace completion __complete "$line" "$point" 2>/dev/null)

	# Check if the completion command failed
	if [[ $? -ne 0 ]]; then
		# Silent failure - completion should never break the shell
		return 0
	fi

	# Preserve each newline-delimited result as one completion candidate.
	# This loop is compatible with Bash 3.2 (which does not provide mapfile).
	COMPREPLY=()
	local completion
	while IFS= read -r completion; do
		[[ -n "$completion" && "$completion" == "$cur"* ]] && COMPREPLY+=("$completion")
	done <<< "$completions"

	# Return success
	return 0
}

# Register the completion function for the 'agentic-workspace' command
# -F: use function for completion
# _agentic-workspace: name of the completion function
# agentic-workspace: command to complete
complete -F _agentic-workspace agentic-workspace
