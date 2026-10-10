import readline from 'node:readline/promises';
import chalk from 'chalk';
import boxen from 'boxen';
import { saveApiKey } from '../utils/config.js';

export async function showApiScreen() {
  console.clear();
  
  const welcomeMessage = `
${chalk.bold.yellow('🔑 Требуется Google API Key')}

Для работы ИИ-анализатора необходим ключ от Google.
Вы можете получить его в личном кабинете Google ai studio.

${chalk.gray('Ключ сохранится локально в безопасной папке на вашем ПК.')}
`;

  console.log(
    boxen(welcomeMessage, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'yellow',
      title: ' Настройка первого запуска ',
      titleAlignment: 'center'
    })
  );

  // Настраиваем интерфейс чтения ввода от пользователя
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Запрашиваем ввод ключа
    const answer = await rl.question(chalk.yellow(' Введите ваш API-ключ: '));
    const trimmedKey = answer.trim();

    if (!trimmedKey) {
      console.log(chalk.red('\n❌ Ключ не может быть пустым. Попробуйте снова.'));
      rl.close();
      process.exit(1);
    }

    // Сохраняем ключ через сервис конфига
    const success = saveApiKey(trimmedKey);

    if (success) {
      console.log(chalk.green('\n✅ Ключ успешно сохранен! Запускаем утилиту...\n'));
    } else {
      console.log(chalk.red('\n❌ Ошибка при сохранении ключа в файл.'));
    }

    rl.close();
  } catch (error) {
    console.error(chalk.red('Произошла ошибка ввода:'), error);
    rl.close();
  }
}