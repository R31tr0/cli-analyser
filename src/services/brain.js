import { GoogleGenAI } from '@google/genai';
import chalk from 'chalk';
import { getApiKey } from '../utils/config.js';

export const MODEL_ID = 'gemini-3.5-flash-lite';
export const MODEL_OPTIONS = [
  { label: 'Gemini 3.5 Flash Lite', id: MODEL_ID },
  { label: 'Gemini 3.6 Flash', id: 'gemini-3.6-flash' },
  { label: 'Gemini 3.1 Flash Lite', id: 'gemini-3.1-flash-lite' },
  { label: 'Gemini 3.5 Flash', id: 'gemini-3.5-flash' },
  { label: 'Gemini 3.7 Flash', id: 'gemini-3.7-flash' },
];

const systemPrompt = `Ты - помощник для разработчиков. 
Твоя задача - анализировать логи и код, находить причины ошибок и давать советы по устранению проблем.
в каждом ответе тебе будет дана архитектура проекта и логи с терминала если они 
есть тебе не обязательно какждый раз проговаривать и обсуждать арзитектуру проекта если она не имеет отношения к проблеме, 
ты должен сосредоточиться на анализе логов и кода, 
выявлении ошибок и предоставлении конкретных рекомендаций по их исправлению.
если пользователь пишет вводное сообщение например привет или приветствие ты должен ответить приветствием и предложением помощи 
не пиши что то по типу (скидывай ошибки или архитектуру ты и так должен будешь ее знать ) просто ответь что готов помочь по коду 

если пользователь вводит -help или -h ты должен вывести список команд которые ты можешь выполнять и краткое описание каждой команды
если пользователь вводит -scan или -s ты должен проанализировать архитектуру проекта и дать рекомендации по улучшению структуры проекта и кода так же выведи структуру такой какая она сейчас есть перед сообщением 
если пользователь вводит -log, -logs или -l тулза передаст тебе логи повторного запуска проекта; просто обьясни логи 
если пользователь вводит -model или -m ты должен написать что это команда для выбора модели
`;

export async function suggestRunCommand(projectArchitecture, userQuery, model = MODEL_ID) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key не найден. Сначала нужно настроить ключ Gemini.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [{
          text: `Определи команду, которой можно перезапустить проект, чтобы получить его терминальный вывод. Используй признаки проекта и конфигурационные файлы; не ограничивайся выбором npm-скрипта. Учитывай пожелания пользователя из запроса «${userQuery}»; ключ -log в начале — это команда CLI, а не часть пожелания. Если пользователь просит запустить только часть проекта (например, только фронтенд), выбери команду только для этой части, не запускай остальные. Если нельзя надёжно определить команду с учётом пожелания, верни пустую строку. Не предлагай команды установки зависимостей, удаления или изменения файлов. Верни только одну команду в одну строку, без Markdown и пояснений.\n\n${projectArchitecture}`,
        }],
      }],
    });

    const command = response?.text?.trim();
    if (!command || command === 'NONE' || /[\r\n]/.test(command) || command.length > 500) {
      throw new Error('ИИ не смог надёжно определить одну команду запуска проекта.');
    }

    return command;
  } catch (error) {
    const message = error?.message || String(error);
    console.error(chalk.red(`Ошибка при определении команды запуска проекта: ${message}`));
    throw new Error('Не удалось определить команду запуска проекта.');
  }
}

export async function askgemini(userQuery, projectArchitecture, terminalLogs = '', model = MODEL_ID) {
  const query = String(userQuery ?? '').trim();

  if (!query) {
    throw new Error('Запрос пустой. Нечего отправлять в Gemini.');
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key не найден. Сначала нужно настроить ключ Gemini.');
  }

  if (!projectArchitecture) {
    throw new Error('Не удалось получить структуру проекта для анализа.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{
            text: [
              systemPrompt,
              `Структура текущего проекта:\n${projectArchitecture}`,
              terminalLogs ? `Логи терминала:\n${terminalLogs}` : '',
              `Запрос пользователя:\n${query}`,
            ].filter(Boolean).join('\n\n'),
          }],
        },
      ],
    });

    const text =
      response?.text ||
      response?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join('') ||
      '';

    if (!text) {
      throw new Error('Пустой ответ от Gemini.');
    }

    return text;
  } catch (error) {
    const message = error?.message || String(error);
    console.error(chalk.red(`Ошибка при обращении к Google Gemini API: ${message}`));
    throw new Error('Не удалось получить ответ от Google Gemini API. Проверьте интернет-соединение и API key.');
  }
}