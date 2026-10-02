import { useEffect, useState } from 'react';
import { Plus, TestTube2, Printer, RefreshCw, ExternalLink, Monitor } from 'lucide-react';
import { PrinterDevice, ShopProfile } from '../types';

type NativePrinter = {
  name: string;
  status: number | string;
  driver: string;
  port: string;
  offline: boolean;
};

type P = {
  printers: PrinterDevice[];
  shopProfile: ShopProfile;
  onAddPrinter: (p: PrinterDevice) => void;
  onRunTestCalibration: (id: string) => void;
};

function nativeStatusLabel(printer: NativePrinter) {
  if (printer.offline) return 'Offline';
  const status = String(printer.status).toLowerCase();
  if (status === '4' || status.includes('printing')) return 'Printing';
  if (status === '3' || status.includes('error')) return 'Error';
  return 'Ready';
}

export function PrinterSettings(p: P) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [ip, setIp] = useState('');
  const [nativePrinters, setNativePrinters] = useState<NativePrinter[]>([]);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [nativeError, setNativeError] = useState('');

  const loadNativePrinters = async () => {
    if (!window.autoPrintNative) {
      setNativePrinters([]);
      setNativeError('Native printer discovery is available in the installed desktop app.');
      return;
    }
    setNativeLoading(true);
    setNativeError('');
    try {
      setNativePrinters(await window.autoPrintNative.printers.list());
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : 'Could not discover local printers.');
    } finally {
      setNativeLoading(false);
    }
  };

  useEffect(() => {
    void loadNativePrinters();
  }, []);

  const add = () => {
    if (!name.trim()) return;
    p.onAddPrinter({
      id: 'printer_' + Date.now(),
      name: name.trim(),
      brand: brand.trim(),
      model: '',
      connectionType: 'NETWORK_LAN',
      ipOrPort: ip.trim(),
      supportedModes: ['bw', 'color'],
      status: 'ready',
      paperTraySheets: 0,
      tonerLevelPercent: 100,
    });
    setName('');
    setBrand('');
    setIp('');
    setOpen(false);
  };

  const openQueue = async (printerName: string) => {
    try {
      await window.autoPrintNative?.printers.openQueue(printerName);
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : 'Could not open printer queue.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <div>
          <h1 className="text-xl font-bold">Printers & Trays</h1>
          <p className="text-xs text-slate-400">Cloud metadata stays separate from the native printer controls on this shop computer.</p>
        </div>
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 rounded-lg text-xs">
          <Plus className="w-4 h-4" /> Add printer
        </button>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Monitor className="w-4 h-4 text-indigo-400" /> Local Windows printers</h2>
            <p className="text-xs text-slate-500 mt-1">Discovered directly from the installed AutoPrint desktop agent.</p>
          </div>
          <button onClick={() => void loadNativePrinters()} disabled={nativeLoading} className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs disabled:opacity-50">
            <RefreshCw className={nativeLoading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> Refresh
          </button>
        </div>
        {nativeError && <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded-lg p-3">{nativeError}</p>}
        {nativePrinters.length === 0 && !nativeLoading ? (
          <p className="text-xs text-slate-500">No local printers were discovered.</p>
        ) : (
          <div className="space-y-2">
            {nativePrinters.map((printer) => (
              <div key={printer.name} className="flex items-center justify-between gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="min-w-0">
                  <b className="text-sm">{printer.name}</b>
                  <p className="text-[11px] text-slate-500 truncate">{printer.driver || 'Windows printer driver'} · {printer.port || 'No port reported'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300">{nativeStatusLabel(printer)}</span>
                  <button onClick={() => void openQueue(printer.name)} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 rounded text-[11px]">
                    <ExternalLink className="w-3 h-3" /> Queue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {p.printers.map(x => (
          <div key={x.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center"><Printer className="w-5 h-5 text-indigo-400" /></div>
                <div><b>{x.name}</b><p className="text-xs text-slate-500">{x.brand} {x.model}</p><p className="text-[11px] text-slate-500">{x.connectionType} · {x.ipOrPort}</p></div>
              </div>
              <span className="text-[10px] px-2 py-1 rounded bg-emerald-950 text-emerald-300">{x.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs"><div className="p-3 bg-slate-950 rounded border border-slate-800">Paper <b>{x.paperTraySheets}</b></div><div className="p-3 bg-slate-950 rounded border border-slate-800">Toner <b>{x.tonerLevelPercent}%</b></div></div>
            <button onClick={() => p.onRunTestCalibration(x.id)} className="mt-4 flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs"><TestTube2 className="w-3 h-3" /> Run calibration test</button>
          </div>
        ))}
      </div>

      {open && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6"><h2 className="font-semibold mb-4">Add printer</h2><input value={name} onChange={e => setName(e.target.value)} placeholder="Printer name" className="w-full mb-3 p-2.5 bg-slate-950 border border-slate-800 rounded" /><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand / model" className="w-full mb-3 p-2.5 bg-slate-950 border border-slate-800 rounded" /><input value={ip} onChange={e => setIp(e.target.value)} placeholder="IP / port / USB identifier" className="w-full mb-4 p-2.5 bg-slate-950 border border-slate-800 rounded" /><div className="flex gap-2"><button onClick={() => setOpen(false)} className="flex-1 p-2 bg-slate-800 rounded">Cancel</button><button onClick={add} className="flex-1 p-2 bg-indigo-600 rounded">Add</button></div></div></div>}
    </div>
  );
}
