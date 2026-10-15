import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { scanProjectFiles } from './LocalScaner.js';

const require = createRequire(import.meta.url);

const LANGUAGE_BY_EXTENSION = new Map([
  ['.c', 'c'],
  ['.cpp', 'cpp'],
  ['.cc', 'cpp'],
  ['.cxx', 'cpp'],
  ['.h', 'c'],
  ['.hpp', 'cpp'],
  ['.cs', 'c_sharp'],
  ['.go', 'go'],
  ['.py', 'python'],
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.ts', 'typescript'],
  ['.tsx', 'tsx']
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'function_definition',
  'function_expression',
  'function_item',
  'function_literal',
  'func_literal',
  'method_declaration',
  'method_definition',
  'local_function_statement',
  'constructor_declaration',
  'arrow_function',
  'lambda_expression'
]);

const CALL_NODE_TYPES = new Set([
  'call_expression',
  'call',
  'invocation_expression'
]);

// Возвращает SHA-256 для исходного кода или нормализованной структуры AST.
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// Обходит узлы AST, чтобы считать типы узлов, вызовы и вложенные функции.
function walkNodes(rootNode, visit) {
  const stack = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop();
    visit(node);
    stack.push(...node.namedChildren);
  }
}

// Получает имя функции из ее AST-узла или имени переменной для стрелочной функции.
function getFunctionName(node) {
  const nameNode = node.childForFieldName('name');
  if (nameNode) return nameNode.text;

  let parent = node.parent;
  while (parent) {
    const parentName = parent.childForFieldName('name');
    if (parentName) return parentName.text;
    if (FUNCTION_NODE_TYPES.has(parent.type)) break;
    parent = parent.parent;
  }

  return `<anonymous@${node.startPosition.row + 1}>`;
}

// Извлекает имя вызываемой функции, включая обращения вида object.method.
function getCallName(node) {
  const callee = node.childForFieldName('function') ??
    node.childForFieldName('callee') ??
    node.namedChildren.find((child) => child.type !== 'argument_list');

  if (!callee) return null;

  const name = callee.text.match(
    /^[\w$]+(?:(?:\.|::|->)[\w$]+)*|^[\w$]+/u
  )?.[0];
  return name || null;
}

// Разбирает файлы и возвращает функции с позициями, хешами, структурой и зависимостями.
export async function parseProject(files = scanProjectFiles()) {
  const { default: Parser } = await import('web-tree-sitter');
  await Parser.init();
  const parser = new Parser();
  const { Language } = Parser;

  const grammarNames = new Set(
    files
      .map((file) => LANGUAGE_BY_EXTENSION.get(path.extname(file.filePath).toLowerCase()))
      .filter(Boolean)
  );
  const languages = new Map();

  for (const grammarName of grammarNames) {
    const grammarPath = require.resolve(
      `tree-sitter-wasms/out/tree-sitter-${grammarName}.wasm`
    );
    languages.set(grammarName, await Language.load(grammarPath));
  }

  const allFunctions = {};

  for (const file of files) {
    const extension = path.extname(file.filePath).toLowerCase();
    const grammarName = LANGUAGE_BY_EXTENSION.get(extension);
    if (!grammarName) continue;

    parser.setLanguage(languages.get(grammarName));
    const tree = parser.parse(file.content);
    const sourceLines = file.content.split(/\r?\n/u);

    walkNodes(tree.rootNode, (node) => {
      if (!FUNCTION_NODE_TYPES.has(node.type)) return;

      const name = getFunctionName(node);
      const code = node.text;
      const nodeVector = {};
      const dependencies = new Set();
      const structure = [];

      walkNodes(node, (child) => {
        nodeVector[child.type] = (nodeVector[child.type] ?? 0) + 1;
        structure.push(child.type);
        if (CALL_NODE_TYPES.has(child.type)) {
          const dependency = getCallName(child);
          if (dependency) dependencies.add(dependency);
        }
      });

      const lineStart = node.startPosition.row + 1;
      const lineEnd = node.endPosition.row + 1;
      const relativePath = file.filePath.split(path.sep).join('/');
      const functionKey = `${relativePath}::${name}`;

      allFunctions[functionKey] = {
        name,
        file: relativePath,
        lineStart,
        lineEnd,
        lineCount: lineEnd - lineStart + 1,
        hash: sha256(code),
        structuralHash: sha256(structure.join(' ')),
        nodeVector,
        dependencies: [...dependencies],
        codeSnippet: sourceLines.slice(lineStart - 1, lineEnd).join('\n')
      };
    });

    tree.delete();
  }

  parser.delete();
  return allFunctions;
}
