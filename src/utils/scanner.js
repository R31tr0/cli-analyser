import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'vendor',
  '.env'
]);
const MAX_TREE_LINES = 300;
const MAX_DEPTH = 6;

function isSensitiveFile(name) {
  return /^\.env(?:\.|$)/i.test(name) ||
    /\.(?:pem|key|p12|pfx)$/i.test(name) ||
    /(?:secret|credential)/i.test(name);
}

function getTreeLines(root) {
  const lines = [];
  let truncated = false;

  function visit(directory, depth) {
    if (depth > MAX_DEPTH || lines.length >= MAX_TREE_LINES) {
      truncated = true;
      return;
    }

    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => {
        if (entry.isDirectory()) return !IGNORED_DIRECTORIES.has(entry.name);
        return entry.isFile() && !isSensitiveFile(entry.name);
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of entries) {
      if (lines.length >= MAX_TREE_LINES) {
        truncated = true;
        return;
      }

      lines.push(`${'  '.repeat(depth)}${entry.isDirectory() ? `${entry.name}/` : entry.name}`);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), depth + 1);
    }
  }

  visit(root, 0);
  if (truncated) lines.push('... (дерево сокращено)');
  return lines;
}

function getPackageSummary(root) {
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) return null;

  let packageData;
  try {
    packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`Не удалось прочитать package.json проекта: ${error.message}`);
  }

  const summary = {
    name: packageData.name,
    description: packageData.description,
    scripts: packageData.scripts,
    dependencies: packageData.dependencies,
    devDependencies: packageData.devDependencies,
  };

  return JSON.stringify(
    Object.fromEntries(Object.entries(summary).filter(([, value]) => value)),
    null,
    2,
  );
}

export function scanProject(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const tree = getTreeLines(root);
  const packageSummary = getPackageSummary(root);

  return [
    `Корневая папка: ${root}`,
    '',
    'Структура файлов:',
    tree.length ? tree.join('\n') : '(папка пуста)',
    ...(packageSummary ? ['', 'Метаданные package.json:', packageSummary] : []),
  ].join('\n');
}