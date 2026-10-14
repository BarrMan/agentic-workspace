# PowerShell completion script for agentic-workspace CLI
#
# NOTE: This script is embedded in the agentic-workspace binary and installed automatically
# via 'agentic-workspace completion install --shell pwsh'. This file serves as reference documentation.
#
# Installation:
#   - Recommended: agentic-workspace completion install --shell pwsh
#   - Manual: Save this script and source it from your $PROFILE.CurrentUserAllHosts
#
# Requirements:
#   - PowerShell 7+ recommended

$__agentic-workspaceCompletionScriptBlock = {
	param($wordToComplete, $commandAst, $cursorPosition)

	$line = $commandAst.ToString()
	# Preserve trailing whitespace context because CommandAst text omits it.
	if ($cursorPosition -gt $line.Length) {
		$line = $line.PadRight($cursorPosition)
	}

	# Cursor position is already an endpoint offset for completion APIs.
	$point = [Math]::Min([Math]::Max($cursorPosition, 0), $line.Length)

	try {
		$completions = @(agentic-workspace completion __complete "$line" "$point" 2>$null)
		foreach ($completion in $completions) {
			if ($completion) {
				$completionText = "$completion "
				[System.Management.Automation.CompletionResult]::new(
					$completionText,
					$completion,
					[System.Management.Automation.CompletionResultType]::ParameterValue,
					$completion
				)
			}
		}
	} catch {
		return
	}
}

Register-ArgumentCompleter -Native -CommandName @("agentic-workspace", "agentic-workspace.exe") -ScriptBlock $__agentic-workspaceCompletionScriptBlock
