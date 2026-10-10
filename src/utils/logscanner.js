import { spawn } from 'node:child_process';

const MAX_LOG_LENGTH = 40_000;

function terminateProcessTree(child) {
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    killer.once('error', reject);
    killer.once('close', (exitCode) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`Не удалось остановить процесс проекта (taskkill завершился с кодом ${exitCode}).`));
      }
    });
  });
}

export function runCommandAndCollectLogs(command, captureDurationMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let logs = '';
    let truncated = false;
    let timedOut = false;
    let terminationError = null;
    const captureTimer = captureDurationMs === null
      ? null
      : setTimeout(() => {
        timedOut = true;
        terminateProcessTree(child).catch((error) => {
          terminationError = error;
          child.kill('SIGTERM');
        });
      }, captureDurationMs);

    const collect = (chunk, output) => {
      const text = chunk.toString();
      output.write(text);
      logs += text;

      if (logs.length > MAX_LOG_LENGTH) {
        logs = logs.slice(-MAX_LOG_LENGTH);
        truncated = true;
      }
    };

    child.stdout.on('data', (chunk) => collect(chunk, process.stdout));
    child.stderr.on('data', (chunk) => collect(chunk, process.stderr));
    child.once('error', (error) => {
      if (captureTimer) clearTimeout(captureTimer);
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      if (captureTimer) clearTimeout(captureTimer);
      if (terminationError) {
        reject(terminationError);
        return;
      }
      resolve({ logs, exitCode, signal, truncated, timedOut });
    });
  });
}
