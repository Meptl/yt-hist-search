const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const BACKEND_HOST = process.env.BACKEND_HOST || process.env.YTHIST_BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = Number(process.env.BACKEND_PORT || '8000');
const IS_DEV = !app.isPackaged;

let backendProcess = null;

function healthUrl() {
  return `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
}

function frontendUrl() {
  if (IS_DEV) {
    return `http://127.0.0.1:${process.env.FRONTEND_PORT || '5173'}`;
  }
  return `http://${BACKEND_HOST}:${BACKEND_PORT}`;
}

function resolveBackendCommand() {
  const projectRoot = path.resolve(__dirname, '..');
  const unixPython = path.join(projectRoot, '.venv', 'bin', 'python');
  const winPython = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
  const uvicornArgs = [
    '-m',
    'uvicorn',
    'ythist.api:app',
    '--host',
    BACKEND_HOST,
    '--port',
    String(BACKEND_PORT)
  ];

  if (fs.existsSync(unixPython)) {
    return {
      command: unixPython,
      args: uvicornArgs
    };
  }

  if (fs.existsSync(winPython)) {
    return {
      command: winPython,
      args: uvicornArgs
    };
  }

  return {
    command: 'uv',
    args: ['run', ...uvicornArgs]
  };
}

function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get(healthUrl(), (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(maxAttempts = 90) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await checkBackendHealth()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Backend did not become healthy in time.');
}

function startBackend() {
  if (backendProcess) {
    return;
  }

  const { command, args } = resolveBackendCommand();
  backendProcess = spawn(command, args, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
    env: {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH
        ? `${path.join(__dirname, '..', 'src')}${path.delimiter}${process.env.PYTHONPATH}`
        : path.join(__dirname, '..', 'src'),
      PYTHONUNBUFFERED: '1'
    }
  });

  backendProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
  });

  backendProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    const suffix = signal ? ` signal=${signal}` : ` code=${code}`;
    process.stderr.write(`[backend] exited${suffix}\n`);
  });
}

function stopBackend() {
  if (!backendProcess) {
    return;
  }

  backendProcess.kill('SIGTERM');
  backendProcess = null;
}

async function createWindow() {
  startBackend();
  await waitForBackend();

  const mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch((error) => {
      process.stderr.write(`[electron] failed to open external url "${url}": ${error.message}\n`);
    });
    return { action: 'deny' };
  });

  await mainWindow.loadURL(frontendUrl());
}

app.whenReady().then(async () => {
  ipcMain.handle('ythist:pick-takeout-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Google Takeout watch-history.html',
      properties: ['openFile'],
      filters: [{ name: 'HTML', extensions: ['html', 'htm', 'json'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  try {
    await createWindow();
  } catch (error) {
    process.stderr.write(`[electron] startup failed: ${error.message}\n`);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});
