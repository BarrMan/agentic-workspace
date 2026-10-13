# PowerShell completion script for agenticworkspace CLI
#
# NOTE: This script is embedded in the agenticworkspace binary and installed automatically
# via 'agenticworkspace completion install --shell pwsh'. This file serves as reference documentation.
#
# Installation:
#   - Recommended: agenticworkspace completion install --shell pwsh
#   - Manual: Save this script and source it from your $PROFILE.CurrentUserAllHosts
#
# Requirements:
#   - PowerShell 7+ recommended

$__agenticworkspaceCompletionScriptBlock = {
	param($wordToComplete, $commandAst, $cursorPosition)

	$line = $commandAst.ToString()
	# Preserve trailing whitespace context because CommandAst text omits it.
	if ($cursorPosition -gt $line.Length) {
		$line = $line.PadRight($cursorPosition)
	}

	# Cursor position is already an endpoint offset for completion APIs.
	$point = [Math]::Min([Math]::Max($cursorPosition, 0), $line.Length)

	try {
		$completions = @(agenticworkspace completion __complete "$line" "$point" 2>$null)
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

Register-ArgumentCompleter -Native -CommandName @("agenticworkspace", "agenticworkspace.exe") -ScriptBlock $__agenticworkspaceCompletionScriptBlock
