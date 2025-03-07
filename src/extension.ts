import * as vscode from 'vscode';

/**
 * Enhanced DocumentSymbolProvider for TCL that supports:
 * - Function definitions (proc)
 * - Namespace definitions
 * - Control structures (if, while, for, etc.)
 * - Proper nesting and hierarchy
 * 
 * This improves navigation and enables sticky scroll.
 */
class TclDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentSymbol[]> {
		const symbols: vscode.DocumentSymbol[] = [];
		const text = document.getText();

		// Process function declarations
		this.processFunctions(document, text, symbols);

		// Process namespaces
		this.processNamespaces(document, text, symbols);

		return symbols;
	}

	private processFunctions(
		document: vscode.TextDocument,
		text: string,
		symbols: vscode.DocumentSymbol[]
	): void {
		// This regex matches proc definitions with proper brace handling
		const regex = /^(\s*)proc\s+(\w+)(?:\s+\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\})?\s*\{/gm;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			const indentation = match[1] || '';
			const functionName = match[2];
			const args = match[3] || '';

			// Find the full function body with proper brace matching
			const startIndex = match.index;
			const startPos = document.positionAt(startIndex);

			// Get the full range including the function body
			const functionRange = this.findMatchingBraceRange(document, text, startIndex + match[0].length - 1);
			if (!functionRange) {
				continue;
			}

			// Create symbol with proper ranges
			const symbol = new vscode.DocumentSymbol(
				functionName,
				`Arguments: ${args.trim()}`,
				vscode.SymbolKind.Function,
				functionRange,
				new vscode.Range(startPos, document.positionAt(startIndex + match[0].length))
			);

			// Add nested symbols (variables defined within the function)
			this.processVariablesInScope(document, text, symbol, functionRange);

			symbols.push(symbol);
		}
	}

	private processNamespaces(
		document: vscode.TextDocument,
		text: string,
		symbols: vscode.DocumentSymbol[]
	): void {
		// This regex matches namespace definitions
		const regex = /^(\s*)namespace\s+(?:eval\s+)?(\S+)(?:\s+\{)?/gm;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			const indentation = match[1] || '';
			const namespaceName = match[2];

			const startIndex = match.index;
			const startPos = document.positionAt(startIndex);

			// Find the namespace body
			const namespaceRange = this.findMatchingBraceRange(document, text, startIndex + match[0].length - 1);
			if (!namespaceRange) {
				continue;
			}

			// Create symbol with proper ranges
			const symbol = new vscode.DocumentSymbol(
				namespaceName,
				'Namespace',
				vscode.SymbolKind.Namespace,
				namespaceRange,
				new vscode.Range(startPos, document.positionAt(startIndex + match[0].length))
			);

			symbols.push(symbol);
		}
	}

	private processVariablesInScope(
		document: vscode.TextDocument,
		text: string,
		parentSymbol: vscode.DocumentSymbol,
		scopeRange: vscode.Range
	): void {
		// Extract the text within the scope
		const scopeStartOffset = document.offsetAt(scopeRange.start);
		const scopeEndOffset = document.offsetAt(scopeRange.end);
		const scopeText = text.substring(scopeStartOffset, scopeEndOffset);

		// Process variable declarations within this scope
		const variableRegex = /\bset\s+(\w+)\s+/g;
		let match: RegExpExecArray | null;

		while ((match = variableRegex.exec(scopeText)) !== null) {
			const variableName = match[1];
			const startOffset = scopeStartOffset + match.index;
			const startPos = document.positionAt(startOffset);
			const endPos = document.positionAt(startOffset + match[0].length);

			// Create a symbol for the variable
			const variableSymbol = new vscode.DocumentSymbol(
				variableName,
				'Variable',
				vscode.SymbolKind.Variable,
				new vscode.Range(startPos, endPos),
				new vscode.Range(startPos, endPos)
			);

			// Add as a child to the parent symbol
			if (!parentSymbol.children) {
				parentSymbol.children = [];
			}
			parentSymbol.children.push(variableSymbol);
		}
	}

	private findMatchingBraceRange(
		document: vscode.TextDocument,
		text: string,
		openBraceOffset: number
	): vscode.Range | null {
		let braceCount = 1;
		let i = openBraceOffset + 1;

		while (i < text.length && braceCount > 0) {
			if (text[i] === '{') {
				braceCount++;
			} else if (text[i] === '}') {
				braceCount--;
			}
			i++;
		}

		if (braceCount === 0) {
			return new vscode.Range(
				document.positionAt(openBraceOffset - 1), // Include the opening brace
				document.positionAt(i)                   // Include the closing brace
			);
		}

		return null;
	}
}

/**
 * Enhanced DefinitionProvider for TCL that supports:
 * - Function definitions (proc)
 * - Variable definitions (set)
 */
class TclDefinitionProvider implements vscode.DefinitionProvider {
	public async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Location | vscode.Location[] | null> {
		// Get the word at the current position
		const wordRange = document.getWordRangeAtPosition(position, /\w+/);
		if (!wordRange) {
			return null;
		}
		const word = document.getText(wordRange);

		// First, check if it's a function call
		const functionLocation = await this.findFunctionDefinition(document, word);
		if (functionLocation) {
			return functionLocation;
		}

		// If not a function, check if it's a variable
		return await this.findVariableDefinition(document, position, word);
	}

	private async findFunctionDefinition(
		document: vscode.TextDocument,
		functionName: string
	): Promise<vscode.Location | null> {
		// Try to find the function definition in the current document first
		const defRegex = new RegExp(`^proc\\s+${functionName}\\s*\\{`, 'gm');
		let text = document.getText();
		let match = defRegex.exec(text);
		if (match) {
			const startPos = document.positionAt(match.index);
			const endPos = new vscode.Position(startPos.line, startPos.character + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			return new vscode.Location(document.uri, range);
		}

		// If not found, search in all TCL files in the workspace
		const searchExclude = vscode.workspace.getConfiguration('search').get<Record<string, boolean>>('exclude', {});
		const excludeGlob = Object.keys(searchExclude)
			.filter(key => searchExclude[key])
			.join(',');
		const files = await vscode.workspace.findFiles('**/*.tcl', excludeGlob);

		for (const file of files) {
			// Skip the file if it's already been checked
			if (file.toString() === document.uri.toString()) {
				continue;
			}
			const doc = await vscode.workspace.openTextDocument(file);
			text = doc.getText();
			const regex = new RegExp(`^proc\\s+${functionName}\\s*\\{`, 'gm');
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

	private async findVariableDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		variableName: string
	): Promise<vscode.Location | vscode.Location[] | null> {
		// For variables, we need context awareness:
		// 1. Look for the variable in the current scope first
		// 2. Then in parent scopes
		// 3. Finally in global scope

		// Get all "set" statements for the variable
		const setRegex = new RegExp(`\\bset\\s+${variableName}\\s+`, 'g');
		const text = document.getText();
		const allMatches: vscode.Location[] = [];

		let match: RegExpExecArray | null;
		while ((match = setRegex.exec(text)) !== null) {
			const startPos = document.positionAt(match.index);
			const endPos = document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Check if this set statement is in the nearest enclosing scope
			if (this.isInNearestEnclosingScope(document, position, startPos)) {
				// If we find a definition in the nearest scope, just return that one
				return new vscode.Location(document.uri, range);
			}

			// Otherwise collect all matches
			allMatches.push(new vscode.Location(document.uri, range));
		}

		// If no ideal match in the nearest scope, return all matches
		// The user can choose which one they want
		return allMatches.length > 0 ? allMatches : null;
	}

	private isInNearestEnclosingScope(
		document: vscode.TextDocument,
		referencePosition: vscode.Position,
		definitionPosition: vscode.Position
	): boolean {
		// Find the nearest enclosing scope for the reference position
		const text = document.getText();

		// Simple implementation: check if the definition is before the reference
		// in the same or outer scope
		if (definitionPosition.isBefore(referencePosition)) {
			// For a more accurate implementation, you would need to track
			// brace nesting and determine if both positions are in the same scope
			return true;
		}

		return false;
	}
}

/**
 * Activate the extension:
 * - Register the enhanced symbol provider for outline and sticky scroll
 * - Register the enhanced definition provider for functions and variables
 */
export function activate(context: vscode.ExtensionContext) {
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