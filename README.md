# Explore Run NPM

Run npm scripts directly from the VS Code Explorer context menu.

## Features

- Right-click a file, folder, or `package.json` in the Explorer and choose **Run NPM Script**.
- Automatically finds the nearest `package.json` for the selected item.
- Shows all available npm scripts in a Quick Pick list.
- Runs the selected script in a VS Code terminal with the correct working directory.
- Supports single-folder and multi-root workspaces.

## Usage

1. Open a project that contains a `package.json`.
2. Right-click a file, folder, or `package.json` in the Explorer.
3. Select **Run NPM Script**.
4. Choose the npm script you want to run.

The extension opens a new terminal and runs:

```sh
npm run <script-name>
```

## Requirements

- VS Code `1.85.0` or newer.
- Node.js and npm available in your environment.

## Extension Settings

This extension does not contribute any settings.

## Known Issues

- The extension currently runs scripts with `npm run`. Package managers such as pnpm, Yarn, and Bun are not selected automatically yet.

## Release Notes

### 1.0.0

Initial release.
