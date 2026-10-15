import { askgemini } from '../services/brain.js';
import { withSpinner } from '../ui/spinners.js';

// Считает взвешенный коэффициент Жаккара по узлам AST и вызовам функций.
export function jaccardSimilarity(firstFunction, secondFunction) {
  const firstFeatures = new Map();
  const secondFeatures = new Map();

  // Представляет типы узлов и зависимости как мультимножества признаков.
  for (const [type, count] of Object.entries(firstFunction.nodeVector ?? {})) {
    firstFeatures.set(`node:${type}`, count);
  }
  for (const dependency of firstFunction.dependencies ?? []) {
    const feature = `dependency:${dependency}`;
    firstFeatures.set(feature, (firstFeatures.get(feature) ?? 0) + 1);
  }
  for (const [type, count] of Object.entries(secondFunction.nodeVector ?? {})) {
    secondFeatures.set(`node:${type}`, count);
  }
  for (const dependency of secondFunction.dependencies ?? []) {
    const feature = `dependency:${dependency}`;
    secondFeatures.set(feature, (secondFeatures.get(feature) ?? 0) + 1);
  }

  // Делит сумму совпадающих весов на сумму объединенных весов.
  const features = new Set([...firstFeatures.keys(), ...secondFeatures.keys()]);
  let intersection = 0;
  let union = 0;

  for (const feature of features) {
    const firstCount = firstFeatures.get(feature) ?? 0;
    const secondCount = secondFeatures.get(feature) ?? 0;
    intersection += Math.min(firstCount, secondCount);
    union += Math.max(firstCount, secondCount);
  }

  return union === 0 ? 0 : intersection / union;
}

// Сравнивает все пары при пустом кэше, иначе  только пары с измененным хешем.
export async function compareFunctionTables(currentFunctions, previousFunctions = {}) {
  const functionEntries = Object.entries(currentFunctions);
  const isFirstRun = Object.keys(previousFunctions).length === 0;
  const changedKeys = new Set(
    functionEntries
      .filter(([key, currentFunction]) =>
        !previousFunctions[key] || previousFunctions[key].hash !== currentFunction.hash
      )
      .map(([key]) => key)
  );
  const comparedPairs = new Set();
  const legacyPairs = [];

  // Обходит уникальные пары и пропускает неизмененные функции после первого запуска.
  for (let firstIndex = 0; firstIndex < functionEntries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < functionEntries.length; secondIndex += 1) {
      const [firstKey, firstFunction] = functionEntries[firstIndex];
      const [secondKey, secondFunction] = functionEntries[secondIndex];

      if (!isFirstRun && !changedKeys.has(firstKey) && !changedKeys.has(secondKey)) continue;

      const similarity = jaccardSimilarity(firstFunction, secondFunction);
      if (similarity < 0.5) continue;

      // Формирует стабильный ключ, чтобы одну пару функций не проверять дважды.
      const pairKey = [firstKey, secondKey].sort().join('\u0000');
      if (comparedPairs.has(pairKey)) continue;
      comparedPairs.add(pairKey);

      // Просит Gemini вынести четкий вердикт и пояснить совпадение назначений.
      const prompt = [
        'Сравни две функции по их назначению и поведению.',
        'Определи, выполняют ли они одну и ту же задачу (в том числе если одна является легаси-копией другой).',
        'В первой строке ответа напиши только «Да» или «Нет».',
        'После первой строки кратко объясни вывод.',
        '',
        `Функция 1 (${firstKey}):`,
        firstFunction.codeSnippet ?? '',
        '',
        `Функция 2 (${secondKey}):`,
        secondFunction.codeSnippet ?? ''
      ].join('\n');
      const response = await withSpinner(
        () => askgemini(prompt, 'Сравнение двух функций проекта'),
        'Сравниваю функции через Gemini...'
      );

      // Выводит подробный ответ только при утвердительном вердикте Gemini.
      if (/^\s*да(?=\s|$|[.!?,:])/iu.test(response)) {
        const result = {
          first: firstKey,
          second: secondKey,
          similarity,
          response
        };
        legacyPairs.push(result);
        console.log(`\n[LocalAnalysis] Найдены функции с одинаковой задачей (${(similarity * 100).toFixed(1)}%):`);
        console.log(response);
      }
    }
  }

  return { comparedPairs: comparedPairs.size, legacyPairs };
}