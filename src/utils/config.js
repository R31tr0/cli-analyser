import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Путь к папке и файлу конфига в системе пользователя 
const CONFIG_DIR = path.join(os.homedir(), '.cli-analyser');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// Проверить, существует ли API-ключ
export function hasApiKey() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return false;
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return Boolean(data.apiKey);
  } catch (error) {
    return false;
  }
}

// Получить сохраненный API-ключ
export function getApiKey() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return data.apiKey || null;
  } catch (error) {
    return null;
  }
}

// Сохранить API-ключ
export function saveApiKey(apiKey) {
  try {
    // Если папки конфига нет — создаем ее
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const configData = { apiKey, updatedAt: new Date().toISOString() };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Ошибка при сохранении ключа:', error);
    return false;
  }
}