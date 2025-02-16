import * as vscode from 'vscode';

/**
 * A basic DocumentSymbolProvider for TCL.
 * It looks for lines that start with "proc" followed by a word (the function name)
 * and an opening brace.
 */
class TclDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentSymbol[]> {
		const symbols: vscode.DocumentSymbol[] = [];
		// This regex matches lines like: proc functionName {
		const regex = /^proc\s+(\w+)\s*\{/gm;
		const text = document.getText();
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			const functionName = match[1];
			const startPos = document.positionAt(match.index);
			// Here we assume the definition is on the same line as the "proc" declaration.
			// Adjust as needed if your definitions span multiple lines.
			const endPos = new vscode.Position(startPos.line, startPos.character + match[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Create a DocumentSymbol for the function
			const symbol = new vscode.DocumentSymbol(
				functionName,
				'', // You can include a detail string if desired.
				vscode.SymbolKind.Function,
				range,
				range
			);
			symbols.push(symbol);
		}
		return symbols;
	}
}

/**
 * A basic DefinitionProvider for TCL.
 * When the user invokes Go to Definition on a symbol, this provider:
 * - Retrieves the word at the current cursor.
 * - Searches the document for a line that starts with "proc <word> {"
 * - Returns the location where that match is found.
 */
class TclDefinitionProvider implements vscode.DefinitionProvider {
	public async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Location | null> {
		// Get the word at the current position
		const wordRange = document.getWordRangeAtPosition(position, /\w+/);
		if (!wordRange) {
			return null;
		}
		const word = document.getText(wordRange);

		// Try to find the definition in the current document first
		const defRegex = new RegExp(`^proc\\s+${word}\\s*\\{`, 'gm');
		let text = document.getText();
		let match = defRegex.exec(text);
		if (match) {
			const startPos = document.positionAt(match.index);
			const endPos = new vscode.Position(startPos.line, startPos.character + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			return new vscode.Location(document.uri, range);
		}

		// If not found, search in all TCL files in the workspace
		const files = await vscode.workspace.findFiles('**/*.tcl');
		for (const file of files) {
			// Skip the file if it's already been checked
			if (file.toString() === document.uri.toString()) {
				continue;
			}
			const doc = await vscode.workspace.openTextDocument(file);
			text = doc.getText();
			const regex = new RegExp(`^proc\\s+${word}\\s*\\{`, 'gm');
			match = regex.exec(text);
			if (match) {
				const startPos = doc.positionAt(match.index);
				const endPos = new vscode.Position(startPos.line, startPos.character + match[0].length);
				const range = new vscode.Range(startPos, endPos);
				return new vscode.Location(doc.uri, range);
			}

		}
		return null;
	}
}


/**
 * Activate the extension:
 * - Register the symbol provider so that the Outline view is populated.
 * - Register the definition provider so that Go To Definition works.
 */
export function activate(context: vscode.ExtensionContext) {
	// You might need to define the TCL language if not already defined.
	// Here we assume a language id of 'tcl'.
	const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
		{ language: 'tcl' },
		new TclDocumentSymbolProvider()
	);
	const definitionProvider = vscode.languages.registerDefinitionProvider(
		{ language: 'tcl' },
		new TclDefinitionProvider()
	);
	context.subscriptions.push(
		symbolProvider,
		definitionProvider
	);
}

export function deactivate() { }
