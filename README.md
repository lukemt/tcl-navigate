# TCL Tools for VS Code

TCL Tools is a lightweight VS Code extension that provides symbol navigation and definition support for TCL files. With this extension, you get:

- **Document Symbol Provider:** Outline view support for TCL functions defined with the `proc` keyword.
- **Definition Provider:** Go to the definition of a TCL function, even if it's in another file.

## Features

- **Document Symbols:** Automatically detects and displays TCL functions in the Outline view.
- **Go to Definition:** Jump directly to a function's definition with a single click or shortcut.

## Installation

1. Open VS Code.
2. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for **TCL Tools**.
4. Click **Install**.

Alternatively, you can install from the VSIX package if you have built the extension locally.

## Usage

- **Outline View:** Open any `.tcl` file and check the Outline view. The extension will display all functions defined with the `proc` keyword.
- **Workspace Symbol Search:** Use `Ctrl+T` (or `Cmd+T`) and type the name of the function you’re looking for.
- **Go to Definition:** Right-click a function name and select **Go to Definition**, or use the shortcut (`F12` by default) to jump directly to the function's definition, even if it's in another file.

## File Associations

If your TCL files are not recognized by VS Code as `tcl`, add the following to your `settings.json`:

```json
"files.associations": {
  "*.tcl": "tcl"
}
```
