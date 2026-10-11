import ora from 'ora';

export async function withSpinner(task, text) {
  const spinner = ora({ text, color: 'cyan' }).start();

  try {
    const result = await task();
    spinner.succeed('Готово');
    return result;
  } catch (error) {
    spinner.fail('Не удалось выполнить операцию');
    throw error;
  }
}