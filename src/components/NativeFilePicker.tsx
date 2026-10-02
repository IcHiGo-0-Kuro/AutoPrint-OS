import { useState } from 'react';
import { FolderOpen, FileText, CheckCircle2 } from 'lucide-react';

type LocalFile = { localFileId: string; deviceId: string; name: string; size: number; path: string };

export function NativeFilePicker() {
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [error, setError] = useState('');

  const choose = async () => {
    if (!window.autoPrintNative) {
      setError('Open AutoPrint OS as the desktop application to choose local files.');
      return;
    }
    setError('');
    const paths = await window.autoPrintNative.files.choose();
    const rows: LocalFile[] = [];
    for (const filePath of paths) {
      try {
        const file = await window.autoPrintNative.files.register(filePath);
        rows.push({ localFileId: file.localFileId, deviceId: file.deviceId, name: file.name, size: file.size, path: file.path });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not register a local file.');
      }
    }
    setFiles(rows);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <b className="text-sm">Local document intake</b>
          <p className="text-[11px] text-slate-500">Files stay on this shop computer. AutoPrint assigns a stable local file ID.</p>
        </div>
        <button onClick={() => void choose()} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 rounded-lg text-xs">
          <FolderOpen className="w-4 h-4" /> Choose files
        </button>
      </div>
      {error && <p className="mt-3 text-[11px] text-amber-300">{error}</p>}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map(file => (
            <div key={file.localFileId} className="flex items-center gap-2 p-2 bg-slate-950 rounded text-xs">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
