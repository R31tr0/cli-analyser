import fs from 'node:fs';
import path from 'node:path';
import { scanProjectFiles, watchProjectFiles } from './LocalScaner.js';
import { parseProject } from './parser.js';
import { compareFunctionTables } from './comparator.js';

const DEFAULT_CACHE_FILE = '.dev-tools-cache.json';


export function loadStorage(cachePath = DEFAULT_CACHE_FILE) {
  try {
    if (fs.existsSync(cachePath)) {
      const rawData = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(rawData);
    }
  } catch (error) {
    console.warn(`[Storage] Не удалось прочитать кэш: ${error.message}`);
  }
  return {};
}


export function saveStorage(storageData, cachePath = DEFAULT_CACHE_FILE) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(storageData, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[Storage] Ошибка сохранения кэша: ${error.message}`);
  }
}

/**
 * @param {Object} allFunctions Объект с функциями из parseProject()
 * @param {string} cachePath Путь к файлу кэша
 * @returns {Object} Компактная таблица кэша
 */
export function updateStorage(allFunctions, cachePath = DEFAULT_CACHE_FILE) {
  const compactTable = {};

  for (const [funcKey, funcData] of Object.entries(allFunctions)) {
    // Фильтруем и оставляем только то, что нужно компаратору и ИИ
    compactTable[funcKey] = {
      name: funcData.name, // имя 
      file: funcData.file, // путь 
      lineCount: funcData.lineCount, // количество строк
      hash: funcData.hash,             // Для 100% проверки на неизменность
      structuralHash: funcData.structuralHash, // Для поиска клонов без имен переменных
      nodeVector: funcData.nodeVector,   // Для формулы Жаккара (баланс конструкций)
      dependencies: funcData.dependencies,     // Для формулы Жаккара (список вызовов)
      codeSnippet: funcData.codeSnippet        // Сохраняем код на случай отправки в ИИ
    };
  }

  // Записываем на диск
  saveStorage(compactTable, cachePath);
  
  return compactTable;
}

// Выполняет начальное сканирование и обновляет таблицу после изменений файлов.
export async function initializeStorage(rootPath = process.cwd()) {
  const cachePath = path.join(rootPath, DEFAULT_CACHE_FILE);
  let debounceTimer;
  let scanQueue = Promise.resolve();

  // Пересобирает таблицу из текущего состояния файлов проекта.
  function rescan() {
    scanQueue = scanQueue.catch(() => {}).then(async () => {
      const files = scanProjectFiles(rootPath);
      const allFunctions = await parseProject(files);

      // Сравнивает с сохраненным снимком до записи новой таблицы.
      const previousFunctions = loadStorage(cachePath);
      try {
        await compareFunctionTables(allFunctions, previousFunctions);
      } catch (error) {
        console.error(`[LocalAnalysis] Не удалось сравнить функции через Gemini: ${error.message}`);
      }

      updateStorage(allFunctions, cachePath);
    });
    return scanQueue;
  }

  // Объединяет серию событий сохранения файла в одно сканирование.
  const watcher = watchProjectFiles(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      rescan().catch((error) => {
        console.error(`[LocalAnalysis] Не удалось обновить таблицу функций: ${error.message}`);
      });
    }, 100);
  }, rootPath);

  try {
    await rescan();
  } catch (error) {
    console.error(`[LocalAnalysis] Не удалось выполнить начальное сканирование: ${error.message}`);
  }

  return {
    close() {
      clearTimeout(debounceTimer);
      watcher.close();
    }
  };
}