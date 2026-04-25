const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const disposable = vscode.commands.registerCommand('exploreRunNpm.runScript', async (uri) => {
    try {
      const packageJsonPath = await findPackageJson(uri);

      if (!packageJsonPath) {
        vscode.window.showWarningMessage('No package.json found for this Explorer item.');
        return;
      }

      const packageJson = await readPackageJson(packageJsonPath);
      const scripts = packageJson.scripts && typeof packageJson.scripts === 'object'
        ? Object.entries(packageJson.scripts)
        : [];

      if (scripts.length === 0) {
        vscode.window.showInformationMessage('This package.json does not define any npm scripts.');
        return;
      }

      const selected = await vscode.window.showQuickPick(
        scripts.map(([name, command]) => ({
          label: name,
          description: command,
          scriptName: name,
        })),
        {
          title: `Run npm script from ${path.basename(path.dirname(packageJsonPath))}`,
          placeHolder: 'Select a script to run',
          matchOnDescription: true,
        }
      );

      if (!selected) {
        return;
      }

      runScript(packageJsonPath, selected.scriptName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Unable to run npm script: ${message}`);
    }
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

/**
 * Finds the nearest package.json related to the clicked Explorer item.
 *
 * @param {vscode.Uri | undefined} uri
 * @returns {Promise<string | undefined>}
 */
async function findPackageJson(uri) {
  if (uri?.scheme === 'file') {
    const clickedPath = uri.fsPath;
    const stat = await fs.promises.stat(clickedPath).catch(() => undefined);

    if (stat?.isFile() && path.basename(clickedPath) === 'package.json') {
      return clickedPath;
    }

    const startDirectory = stat?.isDirectory()
      ? clickedPath
      : path.dirname(clickedPath);
    const nearest = await findUp(startDirectory, 'package.json');

    if (nearest) {
      return nearest;
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders || [];

  if (workspaceFolders.length === 1) {
    return findUp(workspaceFolders[0].uri.fsPath, 'package.json');
  }

  if (workspaceFolders.length > 1) {
    const pickedFolder = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select a workspace folder',
    });

    if (pickedFolder) {
      return findUp(pickedFolder.uri.fsPath, 'package.json');
    }
  }

  return undefined;
}

/**
 * @param {string} startDirectory
 * @param {string} fileName
 * @returns {Promise<string | undefined>}
 */
async function findUp(startDirectory, fileName) {
  let current = path.resolve(startDirectory);

  while (true) {
    const candidate = path.join(current, fileName);

    if (await exists(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} packageJsonPath
 * @returns {Promise<Record<string, unknown>>}
 */
async function readPackageJson(packageJsonPath) {
  const content = await fs.promises.readFile(packageJsonPath, 'utf8');
  return JSON.parse(content);
}

/**
 * @param {string} packageJsonPath
 * @param {string} scriptName
 */
function runScript(packageJsonPath, scriptName) {
  const workingDirectory = path.dirname(packageJsonPath);
  const terminalName = `npm: ${scriptName}`;
  const terminal = vscode.window.createTerminal({
    name: terminalName,
    cwd: workingDirectory,
  });

  terminal.show();
  terminal.sendText(`npm run ${quoteShellArg(scriptName)}`);
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteShellArg(value) {
  if (/^[A-Za-z0-9_:/.-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

module.exports = {
  activate,
  deactivate,
};
