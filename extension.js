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

      const packageManager = await pickPackageManager(packageJsonPath, packageJson);

      if (!packageManager) {
        return;
      }

      runScript(packageJsonPath, selected.scriptName, packageManager);
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
 * @param {Record<string, unknown>} packageJson
 * @returns {Promise<'npm' | 'pnpm' | 'yarn' | 'bun' | undefined>}
 */
async function pickPackageManager(packageJsonPath, packageJson) {
  const packageManagers = await detectPackageManagers(packageJsonPath, packageJson);

  if (packageManagers.length === 1) {
    return packageManagers[0];
  }

  const selected = await vscode.window.showQuickPick(
    packageManagers.map((name) => ({
      label: name,
      description: name === 'npm' ? 'Always available fallback' : `Detected ${name} project`,
      packageManager: name,
    })),
    {
      title: 'Select package manager',
      placeHolder: 'Choose how to run this npm script',
    }
  );

  return selected?.packageManager;
}

/**
 * @param {string} packageJsonPath
 * @param {Record<string, unknown>} packageJson
 * @returns {Promise<Array<'npm' | 'pnpm' | 'yarn' | 'bun'>>}
 */
async function detectPackageManagers(packageJsonPath, packageJson) {
  const packageDirectory = path.dirname(packageJsonPath);
  const detected = [];
  const packageManager = detectPackageManagerFromField(packageJson.packageManager);

  if (packageManager) {
    detected.push(packageManager);
  }

  const lockfileManagers = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ];

  for (const [lockfile, name] of lockfileManagers) {
    if (await exists(path.join(packageDirectory, lockfile))) {
      detected.push(name);
    }
  }

  detected.push('npm');

  return uniquePackageManagers(detected);
}

/**
 * @param {unknown} value
 * @returns {'npm' | 'pnpm' | 'yarn' | 'bun' | undefined}
 */
function detectPackageManagerFromField(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const name = value.split('@')[0];

  if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
    return name;
  }

  return undefined;
}

/**
 * @param {string[]} packageManagers
 * @returns {Array<'npm' | 'pnpm' | 'yarn' | 'bun'>}
 */
function uniquePackageManagers(packageManagers) {
  const supported = new Set(['npm', 'pnpm', 'yarn', 'bun']);
  const unique = [];

  for (const packageManager of packageManagers) {
    if (supported.has(packageManager) && !unique.includes(packageManager)) {
      unique.push(packageManager);
    }
  }

  return unique;
}

/**
 * @param {string} packageJsonPath
 * @param {string} scriptName
 * @param {'npm' | 'pnpm' | 'yarn' | 'bun'} packageManager
 */
function runScript(packageJsonPath, scriptName, packageManager) {
  const workingDirectory = path.dirname(packageJsonPath);
  const terminalName = `${packageManager}: ${scriptName}`;
  const terminal = vscode.window.createTerminal({
    name: terminalName,
    cwd: workingDirectory,
  });

  terminal.show();
  terminal.sendText(buildRunCommand(packageManager, scriptName));
}

/**
 * @param {'npm' | 'pnpm' | 'yarn' | 'bun'} packageManager
 * @param {string} scriptName
 * @returns {string}
 */
function buildRunCommand(packageManager, scriptName) {
  return `${packageManager} run ${quoteShellArg(scriptName)}`;
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
