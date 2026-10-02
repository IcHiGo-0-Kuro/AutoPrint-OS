const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#020617',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc() {
  ipcMain.handle('system:info', () => ({
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    user: os.userInfo().username,
    appVersion: app.getVersion(),
  }));

  ipcMain.handle('files:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents',
          extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'],
        },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('files:stat', (_, filePath) => {
    if (typeof filePath !== 'string') throw new Error('Invalid file path');
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      isFile: stat.isFile(),
    };
  });

  ipcMain.handle('printers:list', () =>
    new Promise((resolve, reject) => {
      if (process.platform !== 'win32') {
        resolve([]);
        return;
      }

      const command =
        'Get-Printer | Select-Object Name,PrinterStatus,DriverName,PortName,WorkOffline | ConvertTo-Json -Compress';

      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { windowsHide: true },
        (error, stdout) => {
          if (error) {
            reject(new Error('Windows printer discovery failed: ' + error.message));
            return;
          }

          try {
            if (!stdout.trim()) {
              resolve([]);
              return;
            }
            const data = JSON.parse(stdout);
            const rows = Array.isArray(data) ? data : [data];
            resolve(
              rows.map((printer) => ({
                name: printer.Name,
                status: printer.PrinterStatus,
                driver: printer.DriverName,
                port: printer.PortName,
                offline: Boolean(printer.WorkOffline),
              })),
            );
          } catch {
            reject(new Error('Could not parse Windows printer information.'));
          }
        },
      );
    }),
  );

  ipcMain.handle('printer:open', (_, printerName) => {
    if (process.platform !== 'win32') {
      throw new Error('Printer actions are currently supported on Windows only.');
    }
    if (typeof printerName !== 'string' || !printerName.trim()) {
      throw new Error('Invalid printer name.');
    }

    return new Promise((resolve, reject) => {
      execFile(
        'rundll32.exe',
        ['printui.dll,PrintUIEntry', '/o', '/n', printerName],
        { windowsHide: true },
        (error) => {
          if (error) {
            reject(new Error('Could not open printer queue.'));
            return;
          }
          resolve(true);
        },
      );
    });
  });
}
