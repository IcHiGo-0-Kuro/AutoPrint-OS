// Security regression tests for the Electron main process.
// Run with: npm run test:desktop   (node --test, no extra dependencies)
//
// main.cjs is loaded against a mocked `electron` module so every IPC handler can
// be called directly, exactly as the renderer would call it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const TRUSTED_FRAME = { url: 'http://localhost:3000/' };
const SUPABASE_ORIGIN = 'https://example-project.supabase.co';
const MEDIA_URL = SUPABASE_ORIGIN + '/functions/v1/whatsapp-media-sync';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'printomatic-test-'));
const handlers = new Map();
const calls = { openPath: [], execFile: [] };
let nextOpenFileDialog = [];

process.env.VITE_SUPABASE_URL = SUPABASE_ORIGIN;

const electronMock = {
  app: {
    isPackaged: false,
    requestSingleInstanceLock: () => true,
    setAsDefaultProtocolClient() {},
    on() {},
    quit() {},
    getVersion: () => '0.0.0-test',
    getPath: (name) => (name === 'userData' ? userData : os.tmpdir()),
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: class {
    constructor() { this.webContents = {}; }
    once() {} on() {} loadURL() {} loadFile() {} show() {} focus() {} isDestroyed() { return false; }
    static getAllWindows() { return [{}]; }
  },
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: nextOpenFileDialog }) },
  shell: { openPath: async (p) => { calls.openPath.push(p); return ''; }, openExternal: async () => {} },
  session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
};

const childProcessMock = {
  execFile: (file, args, options, callback) => { calls.execFile.push({ file, args, options }); callback(null, '', ''); },
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronMock;
  if (request === 'child_process') return childProcessMock;
  return originalLoad.call(this, request, ...rest);
};

require('./main.cjs');

// Calls an IPC handler the way ipcRenderer.invoke would.
function invoke(channel, args = [], frame = TRUSTED_FRAME) {
  const handler = handlers.get(channel);
  assert.ok(handler, 'missing IPC handler: ' + channel);
  return Promise.resolve().then(() => handler({ senderFrame: frame }, ...args));
}

function makeFile(name, contents = 'data') {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'printomatic-file-')), name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

test.before(async () => { await new Promise((resolve) => setImmediate(resolve)); });

test('every IPC channel rejects calls from an untrusted page', async () => {
  assert.ok(handlers.size >= 10);
  for (const channel of handlers.keys()) {
    await assert.rejects(invoke(channel, [], { url: 'https://evil.example/' }), /untrusted page/, channel);
    await assert.rejects(invoke(channel, [], null), /untrusted page/, channel);
  }
});

test('the file dialog only returns printable document types', async () => {
  const pdf = makeFile('report.pdf');
  const exe = makeFile('setup.exe');
  nextOpenFileDialog = [pdf, exe];
  assert.deepEqual(await invoke('files:choose'), [pdf]);
  nextOpenFileDialog = [exe];
  await assert.rejects(invoke('files:choose'), /Unsupported file type/);
});

test('files can only be registered if they came from the picker or the inbox', async () => {
  const notPicked = makeFile('secret.pdf');
  await assert.rejects(invoke('files:register', [notPicked]), /file picker/);

  const picked = makeFile('picked.pdf');
  nextOpenFileDialog = [picked];
  await invoke('files:choose');
  const record = await invoke('files:register', [picked]);
  assert.match(record.localFileId, /^[0-9a-f-]{36}$/);
});

test('executables and scripts can never be registered, even if picked', async () => {
  for (const name of ['run.exe', 'a.lnk', 'b.bat', 'c.cmd', 'd.ps1', 'e.hta', 'f.scr', 'g.js', 'h.vbs', 'i.msi', 'noextension']) {
    const file = makeFile(name);
    nextOpenFileDialog = [file];
    await assert.rejects(invoke('files:choose'), /Unsupported file type/, name);
    await assert.rejects(invoke('files:register', [file]), /./, name);
  }
});

test('files:open and files:stat refuse anything that is not a registered document', async () => {
  const unregistered = makeFile('other.pdf');
  await assert.rejects(invoke('files:open', [unregistered]), /not registered/);
  await assert.rejects(invoke('files:stat', [unregistered]), /not registered/);
  await assert.rejects(invoke('files:open', [path.join(os.tmpdir(), '..', 'etc', 'passwd')]), /not registered/);

  const picked = makeFile('open-me.pdf');
  nextOpenFileDialog = [picked];
  await invoke('files:choose');
  await invoke('files:register', [picked]);
  calls.openPath.length = 0;
  await invoke('files:open', [picked]);
  assert.deepEqual(calls.openPath, [path.resolve(picked)]);
});

function mockDownload(bytes = Buffer.from('%PDF-1.4 test')) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
  };
  return seen;
}

const goodBody = { action: 'download', document_id: 'doc-1' };

test('remote import saves a printable file into the inbox and registers it', async () => {
  const seen = mockDownload();
  const record = await invoke('files:importRemote', [{ url: MEDIA_URL, fileName: 'Invoice 1.pdf', expectedSize: 10, token: 't', body: goodBody }]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.redirect, 'error');
  assert.ok(path.resolve(record.path).startsWith(path.join(userData, 'printomatic-inbox')));
  assert.ok(record.name.endsWith('Invoice_1.pdf'));
  assert.ok(fs.existsSync(record.path));
});

test('remote import refuses customer-named executables without downloading them', async () => {
  const seen = mockDownload();
  for (const fileName of ['invoice.exe', 'photo.png.exe', 'doc.lnk', 'x.bat', '..\\..\\evil.cmd', 'noext']) {
    await assert.rejects(
      invoke('files:importRemote', [{ url: MEDIA_URL, fileName, body: goodBody }]),
      /Unsupported file type/,
      fileName,
    );
  }
  assert.equal(seen.length, 0, 'nothing should have been downloaded');
});

test('remote import only talks to the configured Supabase media endpoint', async () => {
  const seen = mockDownload();
  const bad = [
    'https://evil.example/functions/v1/whatsapp-media-sync',
    SUPABASE_ORIGIN + '/functions/v1/other',
    SUPABASE_ORIGIN + '/functions/v1/whatsapp-media-sync?x=1',
    'http://example-project.supabase.co/functions/v1/whatsapp-media-sync',
  ];
  for (const url of bad) {
    await assert.rejects(invoke('files:importRemote', [{ url, fileName: 'a.pdf', token: 'secret', body: goodBody }]), /Supabase media endpoint|Invalid document download URL/, url);
  }
  await assert.rejects(invoke('files:importRemote', [{ url: MEDIA_URL, fileName: 'a.pdf', body: { action: 'list' } }]), /payload/);
  assert.equal(seen.length, 0, 'the bearer token must never be sent to another host');
});

test('printing passes file and printer through env vars, never through script text', async () => {
  const picked = makeFile('print-me.pdf');
  nextOpenFileDialog = [picked];
  await invoke('files:choose');
  const record = await invoke('files:register', [picked]);

  const evilPrinter = "HP'; Remove-Item -Recurse C:\\ -Force; '";
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    calls.execFile.length = 0;
    await invoke('print:enqueue', [{ jobId: 'job-1', localFileId: record.localFileId, printerName: evilPrinter, copies: 2, headerStampEnabled: false, separatorSheetEnabled: false }]);
    for (let i = 0; i < 50 && !calls.execFile.length; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    Object.defineProperty(process, 'platform', { value: 'linux' });
  }

  const printCall = calls.execFile.find((call) => call.file === 'powershell.exe');
  assert.ok(printCall, 'powershell should have been invoked');
  const script = printCall.args[printCall.args.length - 1];
  assert.ok(!script.includes('Remove-Item'), 'printer name must not appear in the script');
  assert.ok(!script.includes(path.basename(picked)), 'file name must not appear in the script');
  assert.equal(printCall.options.env.PRINTOMATIC_PRINTER, evilPrinter);
  assert.equal(printCall.options.env.PRINTOMATIC_FILE, path.resolve(picked));
  assert.equal(printCall.options.env.PRINTOMATIC_COPIES, '2');
});

test('the preload bridge exposes no channel without a handler', () => {
  const preload = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8');
  const channels = [...preload.matchAll(/invoke\('([^']+)'/g)].map((match) => match[1]);
  assert.ok(channels.length > 0);
  for (const channel of channels) assert.ok(handlers.has(channel), 'preload exposes "' + channel + '" but main.cjs has no handler');
});
