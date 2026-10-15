// файл сканер который будет сканить папки для будущего анализа хеешей и таблиц 
// он не дубликат кода сканера джс в утилах тк как он будет использоватся для других целей 

import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git', '.next', '.nuxt', '.turbo', 'coverage', 'dist', 'node_modules', 'out', 'vendor', '.env'
]);
const SOURCE_FILE_EXTENSION = /\.(js|jsx|mjs|cjs|ts|tsx|py|c|h|cpp|cc|cxx|hpp|cs|go)$/i;

function isSensitiveFile(name) {
  return /^\.env(?:\.|$)/i.test(name) ||
    /\.(?:pem|key|p12|pfx)$/i.test(name) ||
    /(?:secret|credential)/i.test(name);
}

// Рекурсивный обход папок 
export function scanProjectFiles(rootPath = process.cwd()) {
  const root = path.resolve(rootPath);
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          walk(fullPath); // Рекурсивно идем вглубь папок
        }
      } else if (entry.isFile()) {
        if (!isSensitiveFile(entry.name) && SOURCE_FILE_EXTENSION.test(entry.name)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            results.push({
              filePath: path.relative(root, fullPath), // Относительный путь 
              absolutePath: fullPath, // абсолютный путь
              content: content // Содержимое файла
            });
          } catch (error) {
            console.warn(`Ошибка чтения файла ${fullPath}: ${error.message}`);
          }
        }
      }
    }
  }

  walk(root);
  return results; // Возвращаем массив объектов с информацией о файлах
}

// Следит за папками проекта и сообщает об изменениях файлов исходного кода.
export function watchProjectFiles(onChange, rootPath = process.cwd()) {
  const root = path.resolve(rootPath);
  const watchers = new Map();

  // Подключает наблюдатели ко всем разрешенным папкам проекта.
  function refreshWatchers() {
    const directories = new Set();

    function collectDirectories(currentDir) {
      directories.add(currentDir);
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
          collectDirectories(path.join(currentDir, entry.name));
        }
      }
    }

    collectDirectories(root);

    for (const [directory, watcher] of watchers) {
      if (!directories.has(directory)) {
        watcher.close();
        watchers.delete(directory);
      }
    }

    for (const directory of directories) {
      if (watchers.has(directory)) continue;
      const watcher = fs.watch(directory, (eventType, filename) => {
        const name = filename?.toString();
        const changedPath = name ? path.join(directory, name) : directory;
        const isSourceFile = name && SOURCE_FILE_EXTENSION.test(name) &&
          !isSensitiveFile(name);
        const mayBeDirectory = name && !path.extname(name);

        if (!name || isSourceFile || mayBeDirectory) onChange(changedPath);
        if (eventType === 'rename') refreshWatchers();
      });

      watcher.on('error', (error) => {
        console.error(`[LocalScanner] Ошибка отслеживания ${directory}: ${error.message}`);
      });
      watchers.set(directory, watcher);
    }
  }

  // Закрывает все наблюдатели при остановке анализа.
  function close() {
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
  }

  refreshWatchers();
  return { close };
}