import * as vscode from 'vscode';

/**
 * A comprehensive DocumentSymbolProvider for TCL.
 * Supports:
 * - Procedures (global and in namespaces)
 * - Namespaces
 * - Global variables
 * - Namespace variables
 */
class TclDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentSymbol[]> {
		const symbols: vscode.DocumentSymbol[] = [];
		const text = document.getText();

		// Track parent-child relationships for nested symbols
		const namespaceMap = new Map<string, vscode.DocumentSymbol>();

		// Process namespaces first (they can contain procedures and variables)
		this.processNamespaces(document, text, symbols, namespaceMap);

		// Process global procedures
		this.processProcedures(document, text, symbols, namespaceMap);

		// Process global variables
		this.processGlobalVariables(document, text, symbols);

		// Process control blocks (if, elseif, else, foreach, etc.)
		this.processControlBlocks(document, text, symbols);

		return symbols;
	}

	/**
	 * Process namespaces in the document
	 */
	private processNamespaces(
		document: vscode.TextDocument,
		text: string,
		symbols: vscode.DocumentSymbol[],
		namespaceMap: Map<string, vscode.DocumentSymbol>
	): void {
		// Match namespace definitions: namespace eval Name { ... }
		const nsRegex = /^namespace\s+eval\s+(\w+)(?:\s*{([\s\S]*?)^}|\s+([^{]+))/gm;
		let nsMatch: RegExpExecArray | null;

		while ((nsMatch = nsRegex.exec(text)) !== null) {
			const nsName = nsMatch[1];
			const startPos = document.positionAt(nsMatch.index);
			const nsEndMatch = this.findMatchingBrace(text, nsMatch.index + nsMatch[0].indexOf('{'));

			// If we couldn't find the end of the namespace, just use the line
			const endPos = nsEndMatch
				? document.positionAt(nsEndMatch + 1)
				: document.lineAt(startPos.line).range.end;

			const range = new vscode.Range(startPos, endPos);

			// Create namespace symbol
			const nsSymbol = new vscode.DocumentSymbol(
				nsName,
				'namespace',
				vscode.SymbolKind.Namespace,
				range,
				new vscode.Range(startPos, document.lineAt(startPos.line).range.end)
			);

			// Add to symbols and tracking map
			symbols.push(nsSymbol);
			namespaceMap.set(nsName, nsSymbol);

			// Extract namespace content for processing variables and procedures
			const nsContent = nsMatch[2] || '';

			// Process variables in this namespace
			this.processNamespaceVariables(document, nsContent, nsMatch.index + nsMatch[0].indexOf('{') + 1, nsSymbol);

			// Process procedures in this namespace
			this.processNamespaceProcedures(document, nsContent, nsMatch.index + nsMatch[0].indexOf('{') + 1, nsSymbol);
		}
	}

	/**
	 * Process global procedures
	 */
	private processProcedures(
		document: vscode.TextDocument,
		text: string,
		symbols: vscode.DocumentSymbol[],
		namespaceMap: Map<string, vscode.DocumentSymbol>
	): void {
		// This regex matches global procedures: proc functionName {args} {body}
		const procRegex = /^proc\s+([^:\s]+::)?(\w+)\s*{([^}]*)}\s*{/gm;
		let procMatch: RegExpExecArray | null;

		while ((procMatch = procRegex.exec(text)) !== null) {
			const namespace = procMatch[1] ? procMatch[1].slice(0, -2) : null; // Remove trailing ::
			const procName = procMatch[2];
			const args = procMatch[3].trim();
			const startPos = document.positionAt(procMatch.index);

			// Find the end of the procedure body by matching braces
			const procBodyStart = procMatch.index + procMatch[0].length - 1;
			const procEndIndex = this.findMatchingBrace(text, procBodyStart);

			// If we couldn't find the end of the procedure, just use the line
			const endPos = procEndIndex
				? document.positionAt(procEndIndex + 1)
				: document.lineAt(startPos.line).range.end;

			const range = new vscode.Range(startPos, endPos);
			const selectionRange = new vscode.Range(startPos, document.lineAt(startPos.line).range.end);

			// Create procedure symbol
			const procSymbol = new vscode.DocumentSymbol(
				procName,
				args ? `args: ${args}` : '',
				vscode.SymbolKind.Function,
				range,
				selectionRange
			);

			// Add to appropriate parent (namespace or global)
			if (namespace && namespaceMap.has(namespace)) {
				namespaceMap.get(namespace)!.children.push(procSymbol);
			} else {
				symbols.push(procSymbol);
			}

			// Process local variables within this procedure
			if (procEndIndex) {
				const procBody = text.substring(procBodyStart + 1, procEndIndex);
				this.processLocalVariables(document, procBody, procBodyStart + 1, procSymbol);
			}
		}
	}

	/**
	 * Process procedures within a namespace
	 */
	private processNamespaceProcedures(
		document: vscode.TextDocument,
		nsContent: string,
		nsContentStartOffset: number,
		nsSymbol: vscode.DocumentSymbol
	): void {
		// Match procedures within namespace: proc name {args} {body}
		const procRegex = /proc\s+(\w+)\s*{([^}]*)}\s*{/gm;
		let procMatch: RegExpExecArray | null;

		while ((procMatch = procRegex.exec(nsContent)) !== null) {
			const procName = procMatch[1];
			const args = procMatch[2].trim();
			const startPos = document.positionAt(nsContentStartOffset + procMatch.index);

			// Find the end of the procedure body
			const procBodyStart = nsContentStartOffset + procMatch.index + procMatch[0].length - 1;
			const procEndIndex = this.findMatchingBrace(document.getText(), procBodyStart);

			// If we couldn't find the end of the procedure, just use the line
			const endPos = procEndIndex
				? document.positionAt(procEndIndex + 1)
				: document.lineAt(startPos.line).range.end;

			const range = new vscode.Range(startPos, endPos);
			const selectionRange = new vscode.Range(startPos, document.lineAt(startPos.line).range.end);

			// Create procedure symbol and add to namespace
			const procSymbol = new vscode.DocumentSymbol(
				procName,
				args ? `args: ${args}` : '',
				vscode.SymbolKind.Function,
				range,
				selectionRange
			);

			nsSymbol.children.push(procSymbol);

			// Process local variables
			if (procEndIndex) {
				const procBody = document.getText().substring(procBodyStart + 1, procEndIndex);
				this.processLocalVariables(document, procBody, procBodyStart + 1, procSymbol);
			}
		}
	}

	/**
	 * Process global variables
	 */
	private processGlobalVariables(
		document: vscode.TextDocument,
		text: string,
		symbols: vscode.DocumentSymbol[]
	): void {
		// Match global variables: set ::varName value
		const globalVarRegex = /^set\s+::(\w+)\s+(.+)$/gm;
		let varMatch: RegExpExecArray | null;

		while ((varMatch = globalVarRegex.exec(text)) !== null) {
			const varName = varMatch[1];
			const value = varMatch[2].trim();
			const startPos = document.positionAt(varMatch.index);
			const endPos = document.positionAt(varMatch.index + varMatch[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Create variable symbol
			const varSymbol = new vscode.DocumentSymbol(
				varName,
				`value: ${value.length > 20 ? value.substring(0, 20) + '...' : value}`,
				vscode.SymbolKind.Variable,
				range,
				range
			);

			symbols.push(varSymbol);
		}
	}

	/**
	 * Process variables within a namespace
	 */
	private processNamespaceVariables(
		document: vscode.TextDocument,
		nsContent: string,
		nsContentStartOffset: number,
		nsSymbol: vscode.DocumentSymbol
	): void {
		// Match namespace variables: variable varName value
		const nsVarRegex = /variable\s+(\w+)(?:\s+(.+))?$/gm;
		let varMatch: RegExpExecArray | null;

		while ((varMatch = nsVarRegex.exec(nsContent)) !== null) {
			const varName = varMatch[1];
			const value = varMatch[2] ? varMatch[2].trim() : '';
			const startPos = document.positionAt(nsContentStartOffset + varMatch.index);
			const endPos = document.positionAt(nsContentStartOffset + varMatch.index + varMatch[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Create variable symbol and add to namespace
			const varSymbol = new vscode.DocumentSymbol(
				varName,
				value ? `value: ${value.length > 20 ? value.substring(0, 20) + '...' : value}` : 'namespace variable',
				vscode.SymbolKind.Variable,
				range,
				range
			);

			nsSymbol.children.push(varSymbol);
		}
	}

	/**
	 * Process local variables within a procedure
	 */
	private processLocalVariables(
		document: vscode.TextDocument,
		procBody: string,
		procBodyStartOffset: number,
		procSymbol: vscode.DocumentSymbol
	): void {
		// Match local variables: set varName value
		const localVarRegex = /set\s+(\w+)\s+(.+)$/gm;
		let varMatch: RegExpExecArray | null;

		while ((varMatch = localVarRegex.exec(procBody)) !== null) {
			const varName = varMatch[1];
			// Skip already processed variables (e.g., loop variables)
			if (procSymbol.children.some(child => child.name === varName)) {
				continue;
			}

			const value = varMatch[2].trim();
			const startPos = document.positionAt(procBodyStartOffset + varMatch.index);
			const endPos = document.positionAt(procBodyStartOffset + varMatch.index + varMatch[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Create variable symbol and add to procedure
			const varSymbol = new vscode.DocumentSymbol(
				varName,
				`value: ${value.length > 20 ? value.substring(0, 20) + '...' : value}`,
				vscode.SymbolKind.Variable,
				range,
				range
			);

			procSymbol.children.push(varSymbol);
		}

		// Process array variables: array set arrayName { ... }
		const arraySetRegex = /array\s+set\s+(\w+)\s+{([^}]*)}/gm;
		let arrayMatch: RegExpExecArray | null;

		while ((arrayMatch = arraySetRegex.exec(procBody)) !== null) {
			const arrayName = arrayMatch[1];
			const startPos = document.positionAt(procBodyStartOffset + arrayMatch.index);
			const endPos = document.positionAt(procBodyStartOffset + arrayMatch.index + arrayMatch[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Create array symbol and add to procedure
			const arraySymbol = new vscode.DocumentSymbol(
				arrayName,
				'array',
				vscode.SymbolKind.Array,
				range,
				range
			);

			procSymbol.children.push(arraySymbol);
		}
	}

	/**
	 * Process control structures (if, elseif, else, foreach, for, while, switch, catch, etc.)
	 * and add them as DocumentSymbols for sticky scrolling.
	 */

	private processControlBlocks(
		document: vscode.TextDocument,
		text: string,
		symbols: vscode.DocumentSymbol[]
	): void {
		// Regex to match control blocks with an opening brace
		const controlRegex = /\b(if|elseif|else|foreach|for|while|switch|catch)\b[^{]*{.*/gm;
		let match: RegExpExecArray | null;

		while ((match = controlRegex.exec(text)) !== null) {
			const keyword = match[1];
			// Find the position of the opening brace
			const openBracePos = match.index + match[0].lastIndexOf('{');
			const closeBracePos = this.findMatchingBrace(text, openBracePos);
			if (closeBracePos === null) {
				continue;
			}

			const startPos = document.positionAt(match.index);
			const endPos = document.positionAt(closeBracePos + 1);
			const range = new vscode.Range(startPos, endPos);

			// Only add multi-line blocks
			if (endPos.line === startPos.line) {
				continue;
			}

			// Create a symbol for the control block
			const controlSymbol = new vscode.DocumentSymbol(
				keyword,
				`${keyword} block`,
				vscode.SymbolKind.Object,
				range,
				new vscode.Range(startPos, document.lineAt(startPos.line).range.end)
			);

			// Find a parent symbol that completely encloses this block
			const parent = this.findEnclosingSymbol(range, symbols);
			if (parent) {
				parent.children.push(controlSymbol);
			} else {
				console.log("This might empty the outline view")
				symbols.push(controlSymbol);
			}
		}
	}

	/**
	 * Recursively searches for the closest symbol that encloses the given range.
	 */
	private findEnclosingSymbol(
		range: vscode.Range,
		symbols: vscode.DocumentSymbol[]
	): vscode.DocumentSymbol | null {
		for (const symbol of symbols) {
			if (symbol.range.contains(range)) {
				// Look for a more specific child
				const child = this.findEnclosingSymbol(range, symbol.children);
				return child || symbol;
			}
		}
		return null;
	}


	/**
	 * Find the position of the matching closing brace
	 */
	private findMatchingBrace(text: string, openBracePos: number): number | null {
		let braceCount = 1;
		let pos = openBracePos + 1;

		while (pos < text.length && braceCount > 0) {
			const char = text.charAt(pos);
			if (char === '{') {
				braceCount++;
			} else if (char === '}') {
				braceCount--;
			}
			pos++;
		}

		return braceCount === 0 ? pos - 1 : null;
	}
}

/**
 * A comprehensive DefinitionProvider for TCL.
 * Supports:
 * - Procedures (global and in namespaces)
 * - Namespaces
 * - Variables (global, namespace, and local)
 */
class TclDefinitionProvider implements vscode.DefinitionProvider {
	public async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Location | vscode.Location[] | null> {
		// Get the word at the current position
		const wordRange = document.getWordRangeAtPosition(position, /[\w:]+/);
		if (!wordRange) {
			return null;
		}

		const word = document.getText(wordRange);
		const lineText = document.lineAt(position.line).text;

		// Handle different types of symbols based on context
		if (this.isVariableReference(lineText, position.character)) {
			return this.findVariableDefinition(document, word, position);
		} else if (word.includes('::')) {
			// This is a namespace-qualified symbol (e.g., MyNamespace::proc)
			return this.findNamespaceQualifiedDefinition(document, word);
		} else {
			// Try to find procedure or namespace
			const procLocation = await this.findProcedureDefinition(document, word);
			if (procLocation) {
				return procLocation;
			}

			const nsLocation = this.findNamespaceDefinition(document, word);
			if (nsLocation) {
				return nsLocation;
			}

			// If not found in this document, search in workspace
			return this.searchInWorkspace(word);
		}
	}

	/**
	 * Check if the position is part of a variable reference (e.g., $varName or $array(key))
	 */
	private isVariableReference(lineText: string, charPos: number): boolean {
		// Look for $ preceding the variable name
		for (let i = charPos - 1; i >= 0; i--) {
			if (lineText[i] === '$') {
				return true;
			} else if (!/[\w\s()]/.test(lineText[i])) {
				// Stop if we hit a non-variable character
				break;
			}
		}
		return false;
	}

	/**
	 * Find variable definition
	 */
	private async findVariableDefinition(
		document: vscode.TextDocument,
		varName: string,
		position: vscode.Position
	): Promise<vscode.Location | null> {
		const text = document.getText();
		let match: RegExpExecArray | null;

		// Check if it's an array reference (has parentheses)
		const isArrayRef = varName.includes('(');
		const varBaseName = isArrayRef ? varName.substring(0, varName.indexOf('(')) : varName;

		// Handle global variables
		if (varName.startsWith('::')) {
			const globalName = varName.substring(2);
			const globalRegex = new RegExp(`set\\s+::${globalName}\\s+`, 'gm');
			match = globalRegex.exec(text);
			if (match) {
				const startPos = document.positionAt(match.index);
				const endPos = document.positionAt(match.index + match[0].length + 1);
				return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
			}
		}

		// Start by looking in the current procedure/namespace
		const containingProcRange = this.getContainingProcedureRange(document, position);
		if (containingProcRange) {
			const procText = document.getText(containingProcRange);

			// Look for 'set varName' or 'variable varName'
			const setRegex = new RegExp(`set\\s+${varBaseName}\\s+`, 'gm');
			const variableRegex = new RegExp(`variable\\s+${varBaseName}(?:\\s+|$)`, 'gm');

			let localMatch = setRegex.exec(procText);
			if (localMatch) {
				const startPos = document.positionAt(
					document.offsetAt(containingProcRange.start) + localMatch.index
				);
				const endPos = document.positionAt(
					document.offsetAt(containingProcRange.start) + localMatch.index + localMatch[0].length + 1
				);
				return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
			}

			localMatch = variableRegex.exec(procText);
			if (localMatch) {
				const startPos = document.positionAt(
					document.offsetAt(containingProcRange.start) + localMatch.index
				);
				const endPos = document.positionAt(
					document.offsetAt(containingProcRange.start) + localMatch.index + localMatch[0].length
				);
				return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
			}
		}

		// If not found in local context, look in the document
		const setRegex = new RegExp(`set\\s+${varBaseName}\\s+`, 'gm');
		const variableRegex = new RegExp(`variable\\s+${varBaseName}(?:\\s+|$)`, 'gm');

		match = setRegex.exec(text);
		if (match) {
			const startPos = document.positionAt(match.index);
			const endPos = document.positionAt(match.index + match[0].length + 1);
			return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
		}

		match = variableRegex.exec(text);
		if (match) {
			const startPos = document.positionAt(match.index);
			const endPos = document.positionAt(match.index + match[0].length);
			return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
		}

		// If still not found, search in workspace
		return null;
	}

	/**
	 * Find the definition of a namespace-qualified symbol
	 */
	private async findNamespaceQualifiedDefinition(
		document: vscode.TextDocument,
		qualifiedName: string
	): Promise<vscode.Location | null> {
		const parts = qualifiedName.split('::');
		const namespace = parts.slice(0, -1).join('::');
		const symbol = parts[parts.length - 1];

		// Look for the namespace first
		const nsRegex = new RegExp(`namespace\\s+eval\\s+${namespace}\\s*{`, 'gm');
		const text = document.getText();
		let match = nsRegex.exec(text);

		if (match) {
			// Find the namespace body
			const nsBodyStart = match.index + match[0].length - 1;
			const nsBodyEnd = this.findMatchingBrace(text, nsBodyStart);

			if (nsBodyEnd) {
				const nsBody = text.substring(nsBodyStart + 1, nsBodyEnd);

				// Look for the procedure in the namespace
				const procRegex = new RegExp(`proc\\s+${symbol}\\s*{`, 'gm');
				const procMatch = procRegex.exec(nsBody);

				if (procMatch) {
					const startPos = document.positionAt(nsBodyStart + 1 + procMatch.index);
					const procBodyStart = nsBodyStart + 1 + procMatch.index + procMatch[0].length - 1;
					const procBodyEnd = this.findMatchingBrace(text, procBodyStart);
					const endPos = procBodyEnd
						? document.positionAt(procBodyEnd + 1)
						: document.lineAt(startPos.line).range.end;

					return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
				}

				// Look for variable in the namespace
				const varRegex = new RegExp(`variable\\s+${symbol}(?:\\s+|$)`, 'gm');
				const varMatch = varRegex.exec(nsBody);

				if (varMatch) {
					const startPos = document.positionAt(nsBodyStart + 1 + varMatch.index);
					const endPos = document.positionAt(nsBodyStart + 1 + varMatch.index + varMatch[0].length);

					return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
				}
			}
		}

		// If not found, search in workspace
		return this.searchInWorkspace(qualifiedName);
	}

	/**
	 * Find procedure definition
	 */
	private async findProcedureDefinition(
		document: vscode.TextDocument,
		procName: string
	): Promise<vscode.Location | null> {
		// Try to find the definition in the current document
		const defRegex = new RegExp(`proc\\s+${procName}\\s*{`, 'gm');
		const text = document.getText();
		let match = defRegex.exec(text);

		if (match) {
			const startPos = document.positionAt(match.index);
			// Find the procedure body to get the full range
			const procBodyStart = match.index + match[0].length - 1;
			const procBodyEnd = this.findMatchingBrace(text, procBodyStart);
			const endPos = procBodyEnd
				? document.positionAt(procBodyEnd + 1)
				: document.lineAt(startPos.line).range.end;

			return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
		}

		return null;
	}

	/**
	 * Find namespace definition
	 */
	private findNamespaceDefinition(
		document: vscode.TextDocument,
		nsName: string
	): vscode.Location | null {
		// Look for namespace definition
		const nsRegex = new RegExp(`namespace\\s+eval\\s+${nsName}\\s*{`, 'gm');
		const text = document.getText();
		const match = nsRegex.exec(text);

		if (match) {
			const startPos = document.positionAt(match.index);
			// Find the namespace body end
			const nsBodyStart = match.index + match[0].length - 1;
			const nsBodyEnd = this.findMatchingBrace(text, nsBodyStart);
			const endPos = nsBodyEnd
				? document.positionAt(nsBodyEnd + 1)
				: document.lineAt(startPos.line).range.end;

			return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
		}

		return null;
	}

	/**
	 * Get the range of the procedure containing the position
	 */
	private getContainingProcedureRange(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Range | null {
		const text = document.getText();
		const procRegex = /proc\s+(\w+|[\w:]+::[\w:]+)\s*{[^}]*}\s*{/g;
		let match: RegExpExecArray | null;
		let bestProcRange: vscode.Range | null = null;

		while ((match = procRegex.exec(text)) !== null) {
			const procStart = match.index;
			const procBodyStart = match.index + match[0].length - 1;
			const procBodyEnd = this.findMatchingBrace(text, procBodyStart);

			if (procBodyEnd) {
				const startPos = document.positionAt(procStart);
				const endPos = document.positionAt(procBodyEnd + 1);
				const procRange = new vscode.Range(startPos, endPos);

				if (procRange.contains(position)) {
					// If we already found a containing procedure,
					// keep the one with the smallest range (most specific)
					if (!bestProcRange || (
						procRange.end.isBefore(bestProcRange.end) &&
						procRange.start.isAfter(bestProcRange.start)
					)) {
						bestProcRange = procRange;
					}
				}
			}
		}

		return bestProcRange;
	}

	/**
	 * Search for symbol definition in workspace
	 */
	private async searchInWorkspace(symbolName: string): Promise<vscode.Location | null> {
		// Clean up symbol name for search
		const cleanSymbol = symbolName.replace(/::/g, '');

		// Retrieve search.exclude configuration
		const searchExclude = vscode.workspace.getConfiguration('search').get<Record<string, boolean>>('exclude', {});
		const excludeGlob = Object.keys(searchExclude)
			.filter(key => searchExclude[key])
			.join(',');

		// Find TCL files in workspace
		const files = await vscode.workspace.findFiles('**/*.tcl', `{${excludeGlob}}`);

		for (const file of files) {
			const doc = await vscode.workspace.openTextDocument(file);
			const text = doc.getText();

			// Search for procedure
			const procRegex = new RegExp(`proc\\s+(${cleanSymbol}|[\\w:]+::${cleanSymbol})\\s*{`, 'gm');
			let match = procRegex.exec(text);

			if (match) {
				const startPos = doc.positionAt(match.index);
				// Find procedure body end
				const procBodyStart = match.index + match[0].indexOf('{', match[0].indexOf('}') + 1);
				const procBodyEnd = this.findMatchingBrace(text, procBodyStart);
				const endPos = procBodyEnd
					? doc.positionAt(procBodyEnd + 1)
					: doc.lineAt(startPos.line).range.end;

				return new vscode.Location(doc.uri, new vscode.Range(startPos, endPos));
			}

			// Search for namespace
			if (!symbolName.includes('::')) {
				const nsRegex = new RegExp(`namespace\\s+eval\\s+${symbolName}\\s*{`, 'gm');
				match = nsRegex.exec(text);

				if (match) {
					const startPos = doc.positionAt(match.index);
					// Find namespace body end
					const nsBodyStart = match.index + match[0].length - 1;
					const nsBodyEnd = this.findMatchingBrace(text, nsBodyStart);
					const endPos = nsBodyEnd
						? doc.positionAt(nsBodyEnd + 1)
						: doc.lineAt(startPos.line).range.end;

					return new vscode.Location(doc.uri, new vscode.Range(startPos, endPos));
				}
			}
		}

		return null;
	}

	/**
	 * Find the position of the matching closing brace
	 */
	private findMatchingBrace(text: string, openBracePos: number): number | null {
		let braceCount = 1;
		let pos = openBracePos + 1;

		while (pos < text.length && braceCount > 0) {
			const char = text.charAt(pos);
			if (char === '{') {
				braceCount++;
			} else if (char === '}') {
				braceCount--;
			}
			pos++;
		}

		return braceCount === 0 ? pos - 1 : null;
	}
}

/**
 * A FoldingRangeProvider for TCL files.
 * Provides folding ranges for:
 * - Procedures
 * - Namespaces
 * - Blocks (if/while/foreach/etc.)
 */
class TclFoldingRangeProvider implements vscode.FoldingRangeProvider {
	public provideFoldingRanges(
		document: vscode.TextDocument,
		context: vscode.FoldingContext,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.FoldingRange[]> {
		const ranges: vscode.FoldingRange[] = [];
		const text = document.getText();

		// Find all blocks with braces
		this.findBraceBlocks(document, text, ranges);

		return ranges;
	}

	/**
	 * Find all blocks defined with braces
	 */
	private findBraceBlocks(
		document: vscode.TextDocument,
		text: string,
		ranges: vscode.FoldingRange[]
	): void {
		// This regex finds opening braces that might be fold points
		// We look for common TCL keywords followed by braces
		const blockRegex = /\b(proc|namespace|if|while|for|foreach|switch|catch)\b[^{]*{/g;
		let match: RegExpExecArray | null;

		while ((match = blockRegex.exec(text)) !== null) {
			const openBracePos = match.index + match[0].length - 1;
			const closeBracePos = this.findMatchingBrace(text, openBracePos);

			if (closeBracePos !== null) {
				const startLine = document.positionAt(openBracePos).line;
				const endLine = document.positionAt(closeBracePos).line;

				// Only add folding range if it spans multiple lines
				if (endLine > startLine) {
					ranges.push(new vscode.FoldingRange(startLine, endLine));
				}
			}
		}

		// Also find standalone blocks (just braces with no keywords)
		const standaloneBlockRegex = /[\s;][^#\n\r]*{/g;
		while ((match = standaloneBlockRegex.exec(text)) !== null) {
			// Skip blocks already matched by the previous regex
			const openBracePos = match.index + match[0].length - 1;

			// Check if this is a comment
			const lineStart = text.lastIndexOf('\n', openBracePos);
			const lineContent = text.substring(lineStart + 1, openBracePos);
			if (lineContent.trim().startsWith('#')) {
				continue;
			}

			const closeBracePos = this.findMatchingBrace(text, openBracePos);

			if (closeBracePos !== null) {
				const startLine = document.positionAt(openBracePos).line;
				const endLine = document.positionAt(closeBracePos).line;

				// Only add folding range if it spans multiple lines
				if (endLine > startLine) {
					ranges.push(new vscode.FoldingRange(startLine, endLine));
				}
			}
		}
	}

	/**
	 * Find the position of the matching closing brace
	 */
	private findMatchingBrace(text: string, openBracePos: number): number | null {
		let braceCount = 1;
		let pos = openBracePos + 1;

		while (pos < text.length && braceCount > 0) {
			const char = text.charAt(pos);
			if (char === '{') {
				braceCount++;
			} else if (char === '}') {
				braceCount--;
			}
			pos++;
		}

		return braceCount === 0 ? pos - 1 : null;
	}
}

/**
 * A HoverProvider for TCL files.
 * Provides hover information for:
 * - Procedures (signature and docs)
 * - Variables (type and value)
 * - Namespaces
 */
class TclHoverProvider implements vscode.HoverProvider {
	public async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Hover | null> {
		// Get the word at the current position
		const wordRange = document.getWordRangeAtPosition(position, /[\w:]+/);
		if (!wordRange) {
			return null;
		}

		const word = document.getText(wordRange);
		const lineText = document.lineAt(position.line).text;

		// Check context to determine what kind of symbol we're hovering over
		if (this.isVariableReference(lineText, position.character)) {
			return this.getVariableHover(document, word, position);
		} else if (word.includes('::')) {
			// This is a namespace-qualified symbol
			return this.getNamespacedSymbolHover(document, word);
		} else {
			// Try procedures, then namespaces
			const procHover = await this.getProcedureHover(document, word);
			if (procHover) {
				return procHover;
			}

			const nsHover = this.getNamespaceHover(document, word);
			if (nsHover) {
				return nsHover;
			}
		}

		return null;
	}

	/**
	 * Check if the position is part of a variable reference
	 */
	private isVariableReference(lineText: string, charPos: number): boolean {
		// Look for $ preceding the variable name
		for (let i = charPos - 1; i >= 0; i--) {
			if (lineText[i] === '$') {
				return true;
			} else if (!/[\w\s()]/.test(lineText[i])) {
				break;
			}
		}
		return false;
	}

	/**
	 * Get hover information for a variable
	 */
	private async getVariableHover(
		document: vscode.TextDocument,
		varName: string,
		position: vscode.Position
	): Promise<vscode.Hover | null> {
		const wordRange = document.getWordRangeAtPosition(position, /[\w:]+/);

		// Check if it's an array reference
		const isArrayRef = varName.includes('(');
		const varBaseName = isArrayRef ? varName.substring(0, varName.indexOf('(')) : varName;

		// Handle global variables
		if (varName.startsWith('::')) {
			const globalName = varName.substring(2);
			const defLocation = await this.findVariableDefinition(document, globalName, true);

			if (defLocation) {
				const defLine = document.lineAt(defLocation.range.start.line);
				const value = this.extractValueFromSetCommand(defLine.text);

				return new vscode.Hover([
					new vscode.MarkdownString(`**Global Variable**: \`${globalName}\``),
					new vscode.MarkdownString(`**Value**: \`${value}\``)
				], wordRange);
			}
		}

		// Look in local context
		const containingProcRange = this.getContainingProcedureRange(document, position);
		if (containingProcRange) {
			// Look for variable definition within procedure
			const procText = document.getText(containingProcRange);
			const variableRegex = new RegExp(`variable\\s+${varBaseName}(?:\\s+|$)`, 'm');
			const setRegex = new RegExp(`set\\s+${varBaseName}\\s+([^\\n]+)`, 'm');

			let match = variableRegex.exec(procText);
			if (match) {
				return new vscode.Hover([
					new vscode.MarkdownString(`**Namespace Variable**: \`${varBaseName}\``),
					new vscode.MarkdownString(`Imported into current procedure scope`)
				], wordRange);
			}

			match = setRegex.exec(procText);
			if (match) {
				const value = match[1].trim();
				return new vscode.Hover([
					new vscode.MarkdownString(`**Local Variable**: \`${varBaseName}\``),
					new vscode.MarkdownString(`**Value**: \`${value}\``)
				], wordRange);
			}
		}

		// Look in global scope as a fallback
		const defLocation = await this.findVariableDefinition(document, varBaseName, false);
		if (defLocation) {
			const defLine = document.lineAt(defLocation.range.start.line);
			let value = '';

			if (defLine.text.includes('set ')) {
				value = this.extractValueFromSetCommand(defLine.text);
				return new vscode.Hover([
					new vscode.MarkdownString(`**Variable**: \`${varBaseName}\``),
					new vscode.MarkdownString(`**Value**: \`${value}\``)
				], wordRange);
			} else if (defLine.text.includes('variable ')) {
				return new vscode.Hover([
					new vscode.MarkdownString(`**Namespace Variable**: \`${varBaseName}\``)
				], wordRange);
			}
		}

		return null;
	}

	/**
	 * Get hover information for a namespaced symbol
	 */
	private async getNamespacedSymbolHover(
		document: vscode.TextDocument,
		qualifiedName: string
	): Promise<vscode.Hover | null> {
		const parts = qualifiedName.split('::');
		const namespace = parts.slice(0, -1).join('::');
		const symbol = parts[parts.length - 1];

		// Look for procedure
		const nsText = await this.getNamespaceText(document, namespace);
		if (nsText) {
			// Look for procedure
			const procRegex = new RegExp(`proc\\s+${symbol}\\s*{([^}]*)}`);
			let match = procRegex.exec(nsText);

			if (match) {
				const args = match[1].trim();
				// Get procedure documentation (comments before the proc)
				const procStart = nsText.indexOf(`proc ${symbol}`);
				const docComment = this.extractDocComment(nsText, procStart);

				return new vscode.Hover([
					new vscode.MarkdownString(`**Procedure**: \`${qualifiedName}\``),
					new vscode.MarkdownString(`**Arguments**: \`${args}\``),
					new vscode.MarkdownString(docComment)
				]);
			}

			// Look for variable
			const varRegex = new RegExp(`variable\\s+${symbol}(?:\\s+([^\\n]+))?`);
			match = varRegex.exec(nsText);

			if (match) {
				const value = match[1] ? match[1].trim() : '';
				return new vscode.Hover([
					new vscode.MarkdownString(`**Namespace Variable**: \`${qualifiedName}\``),
					value ? new vscode.MarkdownString(`**Value**: \`${value}\``) : new vscode.MarkdownString('')
				]);
			}
		}

		return null;
	}

	/**
	 * Get hover information for a procedure
	 */
	private async getProcedureHover(
		document: vscode.TextDocument,
		procName: string
	): Promise<vscode.Hover | null> {
		const procRegex = new RegExp(`proc\\s+${procName}\\s*{([^}]*)}`);
		const text = document.getText();
		const match = procRegex.exec(text);

		if (match) {
			const args = match[1].trim();
			// Get procedure documentation (comments before the proc)
			const procStart = text.indexOf(`proc ${procName}`);
			const docComment = this.extractDocComment(text, procStart);

			return new vscode.Hover([
				new vscode.MarkdownString(`**Procedure**: \`${procName}\``),
				new vscode.MarkdownString(`**Arguments**: \`${args}\``),
				new vscode.MarkdownString(docComment)
			]);
		}

		return null;
	}

	/**
	 * Get hover information for a namespace
	 */
	private getNamespaceHover(
		document: vscode.TextDocument,
		nsName: string
	): vscode.Hover | null {
		const nsRegex = new RegExp(`namespace\\s+eval\\s+${nsName}`);
		const text = document.getText();
		const match = nsRegex.exec(text);

		if (match) {
			return new vscode.Hover([
				new vscode.MarkdownString(`**Namespace**: \`${nsName}\``)
			]);
		}

		return null;
	}

	/**
	 * Extract documentation comments before a symbol definition
	 */
	private extractDocComment(text: string, symbolPos: number): string {
		// Look for comments before the symbol
		const lineStartPos = text.lastIndexOf('\n', symbolPos - 1);
		if (lineStartPos === -1) {
			return '';
		}

		// Find the start of the comment block
		let currentPos = lineStartPos - 1;
		const comments: string[] = [];

		while (currentPos >= 0) {
			const prevLineEnd = text.lastIndexOf('\n', currentPos);
			if (prevLineEnd === -1) {
				break;
			}

			const line = text.substring(prevLineEnd + 1, currentPos + 1).trim();
			if (line.startsWith('#')) {
				// Add to comments, removing the # character
				comments.unshift(line.substring(1).trim());
			} else if (line !== '') {
				// Stop if we hit a non-comment, non-empty line
				break;
			}

			currentPos = prevLineEnd - 1;
		}

		return comments.join('\n');
	}

	/**
	 * Extract value from a 'set' command
	 */
	private extractValueFromSetCommand(setCommand: string): string {
		// Find the position after the variable name
		const parts = setCommand.trim().split(/\s+/);
		if (parts.length >= 3) {
			// Join everything after the 'set' and variable name
			return parts.slice(2).join(' ');
		}
		return '';
	}

	/**
	 * Find variable definition location
	 */
	private async findVariableDefinition(
		document: vscode.TextDocument,
		varName: string,
		isGlobal: boolean
	): Promise<vscode.Location | null> {
		const text = document.getText();

		if (isGlobal) {
			// Look for global variable definition
			const globalRegex = new RegExp(`set\\s+::${varName}\\s+`, 'gm');
			const match = globalRegex.exec(text);

			if (match) {
				const startPos = document.positionAt(match.index);
				const endPos = document.positionAt(match.index + match[0].length + 1);
				return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
			}
		} else {
			// Look for any variable definition
			const defRegex = new RegExp(`set\\s+${varName}\\s+|variable\\s+${varName}(?:\\s+|$)`, 'gm');
			const match = defRegex.exec(text);

			if (match) {
				const startPos = document.positionAt(match.index);
				const endPos = document.positionAt(match.index + match[0].length);
				return new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
			}
		}

		return null;
	}

	/**
	 * Get text content of a namespace
	 */
	private async getNamespaceText(
		document: vscode.TextDocument,
		namespace: string
	): Promise<string | null> {
		const nsRegex = new RegExp(`namespace\\s+eval\\s+${namespace}\\s*{`, 'gm');
		const text = document.getText();
		const match = nsRegex.exec(text);

		if (match) {
			const nsBodyStart = match.index + match[0].length - 1;
			const nsBodyEnd = this.findMatchingBrace(text, nsBodyStart);

			if (nsBodyEnd) {
				return text.substring(nsBodyStart + 1, nsBodyEnd);
			}
		}

		return null;
	}

	/**
	 * Get the range of the procedure containing the position
	 */
	private getContainingProcedureRange(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Range | null {
		const text = document.getText();
		const procRegex = /proc\s+(\w+|[\w:]+::[\w:]+)\s*{[^}]*}\s*{/g;
		let match: RegExpExecArray | null;
		let bestProcRange: vscode.Range | null = null;

		while ((match = procRegex.exec(text)) !== null) {
			const procStart = match.index;
			const procBodyStart = match.index + match[0].length - 1;
			const procBodyEnd = this.findMatchingBrace(text, procBodyStart);

			if (procBodyEnd) {
				const startPos = document.positionAt(procStart);
				const endPos = document.positionAt(procBodyEnd + 1);
				const procRange = new vscode.Range(startPos, endPos);

				if (procRange.contains(position)) {
					if (!bestProcRange || (
						procRange.end.isBefore(bestProcRange.end) &&
						procRange.start.isAfter(bestProcRange.start)
					)) {
						bestProcRange = procRange;
					}
				}
			}
		}

		return bestProcRange;
	}

	/**
	 * Find the position of the matching closing brace
	 */
	private findMatchingBrace(text: string, openBracePos: number): number | null {
		let braceCount = 1;
		let pos = openBracePos + 1;

		while (pos < text.length && braceCount > 0) {
			const char = text.charAt(pos);
			if (char === '{') {
				braceCount++;
			} else if (char === '}') {
				braceCount--;
			}
			pos++;
		}

		return braceCount === 0 ? pos - 1 : null;
	}
}

/**
 * Configuration for Sticky Scrolling in TCL files
 */
function configureStickyScrolling() {
	// Configure sticky scrolling settings for TCL files
	vscode.workspace.getConfiguration().update(
		'editor.stickyScroll.enabled',
		true,
		vscode.ConfigurationTarget.Global
	);

	vscode.workspace.getConfiguration().update(
		'editor.stickyScroll.maxLineCount',
		5,
		vscode.ConfigurationTarget.Global
	);

	// Enable sticky scroll for TCL specifically
	vscode.workspace.getConfiguration().update(
		'editor.stickyScroll.defaultModel',
		'outlineModel',
		vscode.ConfigurationTarget.Global
	);
}

/**
 * TCL language configuration for bracket matching and auto indentation
 */
function configureTclLanguage() {
	vscode.languages.setLanguageConfiguration('tcl', {
		indentationRules: {
			increaseIndentPattern: /^\s*(.+\{\s*$|.*\{\s*$)/,
			decreaseIndentPattern: /^\s*\}/
		},
		brackets: [
			["{", "}"],
			["[", "]"],
			["(", ")"]
		],
		comments: {
			lineComment: "#"
		}
	});
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
	// Configure the TCL language for better editing experience
	configureTclLanguage();

	// Configure sticky scrolling for TCL files
	configureStickyScrolling();

	// Register the symbol provider (needed for Outline view and sticky scrolling)
	const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
		{ language: 'tcl' },
		new TclDocumentSymbolProvider()
	);

	// Register the definition provider
	const definitionProvider = vscode.languages.registerDefinitionProvider(
		{ language: 'tcl' },
		new TclDefinitionProvider()
	);

	// Register the folding range provider
	const foldingProvider = vscode.languages.registerFoldingRangeProvider(
		{ language: 'tcl' },
		new TclFoldingRangeProvider()
	);

	// Register the hover provider
	const hoverProvider = vscode.languages.registerHoverProvider(
		{ language: 'tcl' },
		new TclHoverProvider()
	);

	context.subscriptions.push(
		symbolProvider,
		definitionProvider,
		foldingProvider,
		hoverProvider
	);

	// Show information message that the extension is activated
	vscode.window.showInformationMessage('TCL Extension activated with enhanced features');
}

export function deactivate() { }