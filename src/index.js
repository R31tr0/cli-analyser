#!/usr/bin/env node
import { hasApiKey } from './utils/config.js';
import readline from 'node:readline/promises';
import { fit, strWidth, wrap } from './utils/text.js';
import { showApiScreen } from './ui/apiscreen.js';
import { askgemini, MODEL_ID, MODEL_OPTIONS, suggestRunCommand } from './services/brain.js';
import { scanProject } from './utils/scanner.js';
import { runCommandAndCollectLogs } from './utils/logscanner.js';
import chalk from 'chalk';
import { randomColor } from './utils/geminicolor.js';


// ---------- Параметры ----------
const MARGIN = 1;          // отступ слева
const PAD_X = 3;           // внутренний отступ слева/справа
const MIN_INPUT_LINES = 4; // минимум строк под ввод
const MAX_WIDTH = 80;
const FIXED_ROWS = 14;     // все строки рамки, кроме строк ввода

// ---------- Отрисовка рамки ----------
function buildBox(chars, color) {
  const cols = process.stdout.columns || 80;
  const W = Math.max(30, Math.min(MAX_WIDTH, cols - MARGIN * 2 - 1));
  const IN = W - 2 - PAD_X * 2; // ширина области текста
  const b = chalk[color];
  const sp = (n) => ' '.repeat(Math.max(0, n));

  // Строка рамки: styled — текст с цветами, w — его видимая ширина
  const row = (styled = '', w = 0) =>
    sp(MARGIN) + b('│') + sp(PAD_X) + styled + sp(IN - w) + sp(PAD_X) + b('│');

  const plain = (text) => {
    const t = fit(text, IN);
    return row(t, strWidth(t));
  };
  const centered = (text, style = (s) => s) => {
    const t = fit(text, IN);
    const w = strWidth(t);
    const left = Math.floor((IN - w) / 2);
    return row(sp(left) + style(t), left + w);
  };

  // Верхняя граница с заголовком
  const title = '  CLI-Analyser  ';
  const leftDash = Math.floor((W - 2 - title.length) / 2);
  const rightDash = W - 2 - title.length - leftDash;
  const top =
    sp(MARGIN) +
    b('╭' + '─'.repeat(leftDash)) +
    b(title) +
    b('─'.repeat(rightDash) + '╮');
  const bottom = sp(MARGIN) + b('╰' + '─'.repeat(W - 2) + '╯');

  const wrapped = wrap(chars, IN);
  const inputRows = Math.max(MIN_INPUT_LINES, wrapped.length);

  const lines = [];
  lines.push('');                                            // верхний отступ
  lines.push(top);
  lines.push(row());                                         // padding сверху
  lines.push(row());
  lines.push(centered(' с возвращением ! ', (s) => chalk.bold.white(s)));
  lines.push(row());
  lines.push(centered('Спросите у меня что угодно, и я постараюсь помочь вам с кодом,'));
  lines.push(centered('архитектурой или поиском ошибок!'));
  lines.push(row());
  const promptText = '💬 Введите ваш запрос:';
  const pt = fit(promptText, IN);
  lines.push(row(b(pt), strWidth(pt)));

  const firstInputRow = lines.length;
  for (let i = 0; i < inputRows; i++) {
    const t = wrapped[i] ?? '';
    lines.push(row(t, strWidth(t)));
  }

  lines.push(row());
  lines.push(plain('').replace(/^/, '')); // пустая строка
  lines[lines.length - 1] = row(chalk.dim(fit('Enter — отправить · alt + enter — новая строка · Ctrl+C — выход', IN)),
    strWidth(fit('Enter — отправить · alt + enter — новая строка · Ctrl+C — выход', IN)));
  lines.push(row());                                         // padding снизу
  lines.push(bottom);

  const lastWrapped = wrapped[wrapped.length - 1];
  const cursorRow = firstInputRow + wrapped.length - 1;      // индекс строки курсора
  const cursorCol = MARGIN + 1 + PAD_X + strWidth(lastWrapped) + 1; // 1-based

  return { text: lines.join('\n'), total: lines.length, cursorRow, cursorCol, IN };
}

// ---------- Ввод ----------
function readInBox(color) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const out = process.stdout;

    const maxInputLines = Math.max(MIN_INPUT_LINES, (out.rows || 30) - FIXED_ROWS - 1);

    let chars = [];
    let prevRow = 0;
    let last = { total: 0, cursorRow: 0 };

    const draw = () => {
      const { text, total, cursorRow, cursorCol } = buildBox(chars, color);
      let seq = '\x1B[?25l';
      if (prevRow > 0) seq += `\x1B[${prevRow}A`;
      seq += '\r\x1B[J' + text;
      // после печати курсор на последней строке рамки — поднимаем в строку ввода
      const up = total - 1 - cursorRow;
      if (up > 0) seq += `\x1B[${up}A`;
      seq += `\x1B[${cursorCol}G\x1B[?25h`;
      out.write(seq);
      prevRow = cursorRow;
      last = { total, cursorRow };
    };

    const finish = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      out.write('\x1B[?25h');
      const down = last.total - 1 - last.cursorRow;
      if (down > 0) out.write(`\x1B[${down}B`);
      out.write('\r\n');
    };

    const tryAdd = (ch) => {
      const { IN } = buildBox(chars, color);
      const next = [...chars, ch];
      if (wrap(next, IN).length > maxInputLines) return;
      chars = next;
    };

    const onData = (chunk) => {
      if (chunk === '\u0003') {            // Ctrl+C
        finish();
        process.exit(0);
      }
      if (chunk === '\r') {                // Enter — отправить
        finish();
        resolve(chars.join(''));
        return;
      }
      if (chunk === '\n' || chunk === '\x1B\r') { // Ctrl+J / Alt+Enter
        tryAdd('\n');
        draw();
        return;
      }
      if (chunk.startsWith('\x1B')) return; // стрелки и т.п.

      const normalized = chunk.length > 1 ? chunk.replace(/\r\n?/g, '\n') : chunk;
      for (const ch of normalized) {
        if (ch === '\u007F' || ch === '\b') {
          chars.pop();
        } else if (ch === '\n') {
          tryAdd('\n');
        } else if (ch >= ' ') {
          tryAdd(ch);
        }
      }
      draw();
    };

    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);

    draw();
  });
}

async function confirmCommand() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(chalk.yellow(`Выполнить эту команду? [y/N]: `));
    return ['y', 'yes', 'д', 'да'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

// ---------- main ----------
async function main() {
  const [mode, ...commandArgs] = process.argv.slice(2);

  if (mode === 'run') {
    if (!commandArgs.length) {
      console.error(chalk.red('Использование: cli-analyser run <команда> [аргументы]'));
      process.exitCode = 1;
      return;
    }

    if (!hasApiKey()) {
      await showApiScreen();
    }

    const command = commandArgs.join(' ');
    console.log(chalk.green(`Запускаю команду проекта: ${command}\n`));
    const { logs, exitCode, signal, truncated } =
      await runCommandAndCollectLogs(command);

    const status = signal ? `сигнал ${signal}` : `код ${exitCode}`;
    const terminalLogs = [
      `Команда: ${command}`,
      `Завершение: ${status}`,
      truncated ? 'Показана только последняя часть вывода (лимит хранения: 40 000 символов).' : '',
      logs || '(команда не вывела текст в stdout/stderr)',
    ].filter(Boolean).join('\n\n');

    try {
      const answer = await askgemini(
        'Автоматически проанализируй вывод запущенной команды. Найди ошибки, объясни их причины и предложи конкретные шаги исправления.',
        scanProject(),
        terminalLogs,
      );
      console.log(chalk.cyan(`\n${answer}\n`));
    } catch (error) {
      console.error(chalk.red(`\n${error.message}\n`));
      process.exitCode = 1;
    }

    if (exitCode && exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  if (!hasApiKey()) {
    await showApiScreen();
  }

  console.clear();

  let currentModel = MODEL_ID;

  while (true) {
    const color = randomColor();
    const userQuery = await readInBox(color);

    if (!userQuery.trim()) {
      console.log(chalk.yellow('\n⚠️ Запрос пустой. Ожидаю новый запрос...\n'));
      continue;
    }

    const modelCommand = userQuery.trim().match(/^(?:-m|-model)(?:\s+(.+))?$/i);
    if (modelCommand) {
      const requestedModel = modelCommand[1]?.trim().toLowerCase();

      if (!requestedModel) {
        console.log(chalk.yellow(`\nТекущая модель: ${currentModel}`));
        console.log(chalk.yellow('Выберите модель:'));
        for (const option of MODEL_OPTIONS) {
          console.log(chalk.yellow(`  ${option.label} (${option.id})`));
        }
        console.log(chalk.gray('\n Введите -m <название или ID модели> для выбора.\n'));
         console.log(chalk.gray(' у каждой модели есть свои лимиты и характеристики увидеть их вы можете на сайте .'));
          console.log(chalk.gray('https://aistudio.google.com/rate-limit'));
        continue;
      }

      const selectedModel = MODEL_OPTIONS.find((option) =>
        option.label.toLowerCase() === requestedModel || option.id === requestedModel
      );

      if (!selectedModel) {
        console.log(chalk.red(`\nНеизвестная модель: ${modelCommand[1]}. Используйте -m, чтобы увидеть список моделей.\n`));
        continue;
      }

      currentModel = selectedModel.id;
      console.log(chalk.green(`\nВыбрана модель: ${selectedModel.label} (${currentModel})\n`));
      continue;
    }

    console.log(chalk.green(`\n  думаем : "${userQuery}"...\n`));
    try {
      const projectArchitecture = scanProject();
      let terminalLogs = '';

      const [commandName] = userQuery.trim().split(/\s+/);
      const commandOption = commandName.toLowerCase();
      const isLogsRequest = ['-log', '-logs', '-l'].includes(commandOption);
      const isFixRequest = ['-fix', '-f'].includes(commandOption);

      if (isLogsRequest || isFixRequest) {
        const runCommand = await suggestRunCommand(projectArchitecture, userQuery, currentModel);

        console.log(chalk.yellow(`ИИ предлагает перезапустить проект командой:\n\n  ${runCommand}\n`));
        console.log(chalk.gray('Команда будет выполнена в текущей папке проекта. Проверь её перед подтверждением.'));
        if (!await confirmCommand()) {
          console.log(chalk.gray('\nЗапуск отменён; команда не выполнялась.\n'));
          continue;
        }

        console.log(chalk.green('\nЗапускаю проект и собираю вывод (максимум 15 секунд для долгоживущего процесса)...\n'));

        const result = await runCommandAndCollectLogs(runCommand, 15_000);
        terminalLogs = [
          `Команда: ${runCommand}`,
          `Код завершения: ${result.exitCode ?? 'неизвестен'}`,
          result.timedOut ? 'Сбор остановлен по лимиту времени (15 секунд).' : '',
          result.truncated ? 'Показана только последняя часть вывода (лимит хранения: 40 000 символов).' : '',
          result.logs || '(команда не вывела текст в stdout/stderr)',
        ].filter(Boolean).join('\n\n');
      }

      const request = isFixRequest
        ? 'Проанализируй логи повторного запуска и структуру проекта. Если приложение падает или команда завершается с ошибкой, найди первопричину и дай конкретные шаги, как исправить её, с указанием файлов или команд. Не утверждай, что исправил код: только объясни решение.'
        : userQuery;
      const answer = await askgemini(request, projectArchitecture, terminalLogs, currentModel);
      console.log(chalk.cyan(`\n${answer}\n`));
    } catch (error) {
      console.error(chalk.red(`\n${error.message}\n`));
    }
  }
}

main();