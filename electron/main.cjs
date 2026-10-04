const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const isDev = !app.isPackaged;
let mainWindow;

function registryPath() {
  return path.join(app.getPath('userData'), 'local-registry.json');
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
  } catch {
    return { deviceId: crypto.randomUUID(), files: {} };
  }
}

function writeRegistry(registry) {
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2), 'utf8');
}

function getOrCreateDeviceId() {
  const registry = readRegistry();
  if (!registry.deviceId) registry.deviceId = crypto.randomUUID();
  writeRegistry(registry);
  return registry.deviceId;
}

async function downloadRemoteFile(url, suggestedName, expectedSize, token) {
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Only HTTPS document downloads are allowed.');
  const response = await fetch(url, { redirect: 'follow', headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!response.ok) throw new Error('Document download failed with HTTP ' + response.status + '.');
  const contentLength = Number(response.headers.get('content-length') || 0);
  const maxBytes = 50 * 1024 * 1024;
  if (contentLength > maxBytes || Number(expectedSize || 0) > maxBytes) throw new Error('Document exceeds the 50 MB desktop limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('Document exceeds the 50 MB desktop limit.');
  const safeName = String(suggestedName || 'whatsapp-document').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 160) || 'whatsapp-document';
  const inbox = path.join(app.getPath('userData'), 'printomatic-inbox');
  fs.mkdirSync(inbox, { recursive: true });
  const destination = path.join(inbox, crypto.randomUUID() + '-' + safeName);
  const temp = destination + '.tmp';
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, destination);
  return registerLocalFile(destination);
}

function registerLocalFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Invalid file path.');
  const absolutePath = path.resolve(filePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error('Selected path is not a file.');

  const registry = readRegistry();
  const key = absolutePath.toLowerCase();
  const existing = registry.files?.[key];
  const fingerprint = stat.size + ':' + stat.mtimeMs;
  const record = existing?.fingerprint === fingerprint
    ? existing
    : {
        localFileId: crypto.randomUUID(),
        path: absolutePath,
        name: path.basename(absolutePath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        fingerprint,
        registeredAt: new Date().toISOString(),
      };

  registry.files = registry.files || {};
  registry.files[key] = record;
  writeRegistry(registry);
  return { deviceId: getOrCreateDeviceId(), ...record };
}

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
  if (isDev) mainWindow.loadURL('http://localhost:3000');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerIpc();
  recoverInterruptedPrints();
  void processPrintQueue();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const PRINT_QUEUE_VERSION = 1;
let queueProcessing = false;

function queuePath() {
  return path.join(app.getPath('userData'), 'native-print-queue.json');
}

function readPrintQueue() {
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath(), 'utf8'));
    if (parsed?.version !== PRINT_QUEUE_VERSION || !Array.isArray(parsed.jobs)) return [];
    return parsed.jobs;
  } catch {
    return [];
  }
}

function recoverInterruptedPrints() {
  const jobs = readPrintQueue();
  let changed = false;
  const recovered = jobs.map((job) => {
    if (job.status !== 'printing') return job;
    changed = true;
    return {
      ...job,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: 'Print process was interrupted while this job was being submitted. Verify the printer before retrying.',
    };
  });
  if (changed) writePrintQueue(recovered);
  return recovered;
}

function writePrintQueue(jobs) {
  fs.mkdirSync(path.dirname(queuePath()), { recursive: true });
  const tempPath = queuePath() + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify({ version: PRINT_QUEUE_VERSION, jobs }, null, 2), 'utf8');
  fs.renameSync(tempPath, queuePath());
}

function resolveRegisteredFile(localFileId) {
  const registry = readRegistry();
  const record = Object.values(registry.files || {}).find(file => file?.localFileId === localFileId);
  if (!record) throw new Error('Local file is not registered on this desktop.');
  if (!fs.existsSync(record.path)) throw new Error('Registered local file no longer exists.');
  const stat = fs.statSync(record.path);
  if (!stat.isFile()) throw new Error('Registered local path is not a file.');
  const fingerprint = stat.size + ':' + stat.mtimeMs;
  if (fingerprint !== record.fingerprint) throw new Error('Registered local file changed since it was queued.');
  return { ...record, size: stat.size, modifiedAt: stat.mtime.toISOString(), fingerprint };
}

function escapePowerShellString(value) {
  return String(value).replace(/'/g, "''");
}

function executeWindowsPrint(job) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Native printing is currently supported on Windows only.'));
  const filePath = escapePowerShellString(job.path);
  const printerName = escapePowerShellString(job.printerName);
  const copies = Math.max(1, Math.min(99, Number(job.copies) || 1));
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$file = '" + filePath + "'",
    "$printer = '" + printerName + "'",
    "$copies = " + copies,
    'for ($i = 0; $i -lt $copies; $i++) {',
    '  $process = Start-Process -FilePath $file -Verb PrintTo -ArgumentList @($printer) -PassThru -Wait',
    '  if ($process.ExitCode -ne 0) { exit $process.ExitCode }',
    '}',
  ].join('; ');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, error => {
      if (error) reject(new Error('Windows print submission failed: ' + error.message));
      else resolve();
    });
  });
}

async function stampPdfFirstPage(sourcePath, destinationPath, shortNumber) {
  const bytes = fs.readFileSync(sourcePath);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const pages = pdf.getPages();
  if (!pages.length) throw new Error('PDF contains no printable pages.');
  const page = pages[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 7;
  const text = '#' + String(shortNumber || '').replace(/[^0-9A-Za-z-]/g, '');
  if (!text || text === '#') throw new Error('No short order number is available for the print marker.');
  const width = font.widthOfTextAtSize(text, size);
  const margin = 8;
  page.drawText(text, {
    x: Math.max(margin, page.getWidth() - width - margin),
    y: Math.max(margin, page.getHeight() - size - margin),
    size,
    font,
    color: rgb(0.45, 0.45, 0.45),
    opacity: 0.72,
  });
  fs.writeFileSync(destinationPath, await pdf.save());
}

async function createSeparatorPdf(job) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const shortNumber = String(job.shortNumber || '----');
  const token = String(job.printToken || 'PRINTOMATIC');
  const lines = [
    { text: 'PRINTOMATIC', font: bold, size: 18 },
    { text: 'ORDER #' + shortNumber, font: bold, size: 15 },
    { text: 'Token: ' + token, font, size: 8 },
    { text: 'Copies: ' + String(job.copies || 1), font, size: 8 },
    { text: 'READY FOR PICKUP IDENTIFICATION', font: bold, size: 9 },
  ];
  let y = 650;
  for (const line of lines) {
    const width = line.font.widthOfTextAtSize(line.text, line.size);
    page.drawText(line.text, {
      x: (612 - width) / 2,
      y,
      size: line.size,
      font: line.font,
      color: rgb(0.25, 0.25, 0.25),
    });
    y -= line.size + 18;
  }
  page.drawLine({ start: { x: 90, y: 590 }, end: { x: 522, y: 590 }, thickness: 0.7, color: rgb(0.75, 0.75, 0.75) });
  page.drawLine({ start: { x: 90, y: 465 }, end: { x: 522, y: 465 }, thickness: 0.7, color: rgb(0.75, 0.75, 0.75) });
  const filePath = path.join(app.getPath('temp'), 'printomatic-' + job.id + '-separator.pdf');
  fs.writeFileSync(filePath, await pdf.save());
  return filePath;
}

async function preparePrintFile(job, sourcePath) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!job.headerStampEnabled || extension !== '.pdf') {
    return { path: sourcePath, temporary: false, headerStampApplied: false };
  }
  const destinationPath = path.join(app.getPath('temp'), 'printomatic-' + job.id + '-stamped.pdf');
  await stampPdfFirstPage(sourcePath, destinationPath, job.shortNumber);
  return { path: destinationPath, temporary: true, headerStampApplied: true };
}

async function executePrintSequence(job, sourcePath) {
  const prepared = await preparePrintFile(job, sourcePath);
  let separatorPath = null;
  try {
    await executeWindowsPrint({ ...job, path: prepared.path });
    if (job.separatorSheetEnabled) {
      separatorPath = await createSeparatorPdf(job);
      await executeWindowsPrint({ ...job, path: separatorPath, copies: 1 });
    }
    return { headerStampApplied: prepared.headerStampApplied, separatorPrinted: Boolean(separatorPath) };
  } finally {
    for (const temporaryPath of [prepared.temporary ? prepared.path : null, separatorPath]) {
      if (temporaryPath) {
        try { fs.rmSync(temporaryPath, { force: true }); } catch {}
      }
    }
  }
}

async function processPrintQueue() {
  if (queueProcessing) return;
  queueProcessing = true;
  try {
    while (true) {
      const jobs = readPrintQueue();
      const index = jobs.findIndex(job => job.status === 'queued');
      if (index < 0) break;
      const job = jobs[index];
      job.status = 'printing';
      job.startedAt = new Date().toISOString();
      writePrintQueue(jobs);
      try {
        const file = resolveRegisteredFile(job.localFileId);
        const result = await executePrintSequence(job, file.path);
        const latest = readPrintQueue();
        const current = latest.find(item => item.id === job.id);
        if (current) {
          current.status = 'completed';
          current.completedAt = new Date().toISOString();
          current.error = null;
          current.headerStampApplied = result.headerStampApplied;
          current.separatorPrinted = result.separatorPrinted;
          writePrintQueue(latest);
        }
      } catch (error) {
        const latest = readPrintQueue();
        const current = latest.find(item => item.id === job.id);
        if (current) {
          current.status = 'failed';
          current.completedAt = new Date().toISOString();
          current.error = error instanceof Error ? error.message : 'Native print failed.';
          writePrintQueue(latest);
        }
      }
    }
  } finally {
    queueProcessing = false;
  }
}

function registerIpc() {
  ipcMain.handle('system:info', () => ({
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    user: os.userInfo().username,
    appVersion: app.getVersion(),
    deviceId: getOrCreateDeviceId(),
  }));

  ipcMain.handle('files:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('files:stat', (_, filePath) => {
    if (typeof filePath !== 'string') throw new Error('Invalid file path');
    const stat = fs.statSync(filePath);
    return { path: filePath, name: path.basename(filePath), size: stat.size, modifiedAt: stat.mtime.toISOString(), isFile: stat.isFile() };
  });

  ipcMain.handle('files:register', (_, filePath) => registerLocalFile(filePath));

  ipcMain.handle('files:resolve', (_, localFileId) => {
    if (typeof localFileId !== 'string' || !localFileId.trim()) throw new Error('Invalid local file ID.');
    const registry = readRegistry();
    const record = Object.values(registry.files || {}).find(file => file?.localFileId === localFileId);
    if (!record) return null;
    return { localFileId: record.localFileId, path: record.path, name: record.name, size: record.size, modifiedAt: record.modifiedAt, fingerprint: record.fingerprint };
  });

  ipcMain.handle('files:importRemote', async (_, input) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid document download request.');
    return downloadRemoteFile(input.url, input.fileName, input.expectedSize, input.token);
  });

  ipcMain.handle('printers:list', () => new Promise((resolve, reject) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    const command = 'Get-Printer | Select-Object Name,PrinterStatus,DriverName,PortName,WorkOffline | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (error, stdout) => {
      if (error) { reject(new Error('Windows printer discovery failed: ' + error.message)); return; }
      try {
        if (!stdout.trim()) { resolve([]); return; }
        const data = JSON.parse(stdout);
        const rows = Array.isArray(data) ? data : [data];
        resolve(rows.map(printer => ({ name: printer.Name, status: printer.PrinterStatus, driver: printer.DriverName, port: printer.PortName, offline: Boolean(printer.WorkOffline) })));
      } catch { reject(new Error('Could not parse Windows printer information.')); }
    });
  }));

  ipcMain.handle('print:enqueue', (_, input) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid print request.');
    if (typeof input.jobId !== 'string' || !input.jobId.trim()) throw new Error('Invalid print job ID.');
    if (typeof input.localFileId !== 'string' || !input.localFileId.trim()) throw new Error('Invalid local file ID.');
    if (typeof input.printerName !== 'string' || !input.printerName.trim()) throw new Error('Invalid printer name.');
    const file = resolveRegisteredFile(input.localFileId);
    const jobs = readPrintQueue();
    const existing = jobs.find(job => job.id === input.jobId && ['queued', 'printing'].includes(job.status));
    if (existing) return existing;
    const job = {
      id: input.jobId,
      localFileId: input.localFileId,
      printerName: input.printerName,
      copies: Math.max(1, Math.min(99, Number(input.copies) || 1)),
      shortNumber: typeof input.shortNumber === 'string' ? input.shortNumber.slice(0, 12) : '',
      printToken: typeof input.printToken === 'string' ? input.printToken.slice(0, 64) : '',
      headerStampEnabled: input.headerStampEnabled !== false,
      separatorSheetEnabled: input.separatorSheetEnabled !== false,
      fileName: file.name,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
      headerStampApplied: false,
      separatorPrinted: false,
    };
    jobs.push(job);
    writePrintQueue(jobs);
    void processPrintQueue();
    return job;
  });

  ipcMain.handle('print:queue', () => readPrintQueue());

  ipcMain.handle('printer:open', (_, printerName) => {
    if (process.platform !== 'win32') throw new Error('Printer actions are currently supported on Windows only.');
    if (typeof printerName !== 'string' || !printerName.trim()) throw new Error('Invalid printer name.');
    return new Promise((resolve, reject) => {
      execFile('rundll32.exe', ['printui.dll,PrintUIEntry', '/o', '/n', printerName], { windowsHide: true }, error => {
        if (error) { reject(new Error('Could not open printer queue.')); return; }
        resolve(true);
      });
    });
  });
}
