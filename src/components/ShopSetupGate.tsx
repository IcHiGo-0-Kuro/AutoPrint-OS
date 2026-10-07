import { FormEvent, useEffect, useState } from 'react';
import { Check, Printer, Store, Wifi } from 'lucide-react';
import { createShop } from '../lib/autoprintRepository';

type NativePrinter = {
  name: string;
  status: number | string;
  driver: string;
  port: string;
  offline: boolean;
};

export function ShopSetupGate({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [city, setCity] = useState('');
  const [campus, setCampus] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [nativePrinters, setNativePrinters] = useState<NativePrinter[]>([]);
  const [selectedPrinters, setSelectedPrinters] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPrinters = async () => {
    if (!window.autoPrintNative) {
      setError('Printomatic must be running as the installed desktop app to discover Windows printers.');
      return;
    }
    setLoadingPrinters(true);
    setError('');
    try {
      const printers = await window.autoPrintNative.printers.list();
      setNativePrinters(printers);
      setSelectedPrinters((current) => current.filter((name) => printers.some((printer) => printer.name === name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not discover Windows printers.');
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => { void loadPrinters(); }, []);

  const togglePrinter = (printerName: string) => {
    setSelectedPrinters((current) => current.includes(printerName)
      ? current.filter((name) => name !== printerName)
      : [...current, printerName]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!whatsappNumber.trim()) throw new Error('WhatsApp number is required so customers can send print jobs to this shop.');
      await createShop(name.trim(), city.trim(), campus.trim(), ownerName.trim(), whatsappNumber.trim(), nativePrinters.filter((printer) => selectedPrinters.includes(printer.name)));
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the shop workspace.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="autoprint-header-mark"><Store className="w-5 h-5" /></div>
          <div><h1 className="text-xl font-semibold">Set up your Printomatic shop</h1><p className="text-xs text-slate-400 mt-1">Enter the real shop details once. They are saved to your private shop workspace.</p></div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <label className="block text-sm font-medium text-slate-300">Shop name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full px-4 py-3 text-sm rounded-lg bg-slate-950 border border-slate-800" /></label>
          <label className="block text-xs text-slate-400">Owner / operator name<input required value={ownerName} onChange={e=>setOwnerName(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" /></label>
          <label className="block text-xs text-slate-400">WhatsApp number<input required value={whatsappNumber} onChange={e=>setWhatsappNumber(e.target.value)} placeholder="+91..." type="tel" className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" /><span className="block mt-1 text-[10px] text-slate-500">The number customers will use to send documents to this shop.</span></label>
          <label className="block text-xs text-slate-400">City<input value={city} onChange={e=>setCity(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" /></label>
          <label className="block md:col-span-2 text-xs text-slate-400">Campus / location<input value={campus} onChange={e=>setCampus(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" /></label>
        </div>

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold flex items-center gap-2"><Printer className="w-4 h-4 text-indigo-400" /> Windows printers</h2><p className="text-[11px] text-slate-500 mt-1">Select a Windows printer if one is available. You can also skip this and add a printer later.</p></div>
            <button type="button" onClick={() => void loadPrinters()} disabled={loadingPrinters} className="px-3 py-2 rounded-lg bg-slate-800 text-xs disabled:opacity-50">{loadingPrinters ? 'Scanning…' : 'Refresh'}</button>
          </div>

          <div className="mt-3 space-y-2">
            {!nativePrinters.length && !loadingPrinters && <p className="text-xs text-slate-500">No Windows printers found. You can finish setup now and add a printer later.</p>}
            {nativePrinters.map((printer) => {
              const selected = selectedPrinters.includes(printer.name);
              return <button type="button" key={printer.name} onClick={() => togglePrinter(printer.name)} className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left ${selected ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900'}`}>
                <span className="min-w-0"><b className="text-sm truncate block">{printer.name}</b><span className="text-[10px] text-slate-500">{printer.driver || 'Windows driver'} · {printer.port || 'local'} · {printer.offline ? 'Offline' : 'Ready'}</span></span>
                <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{selected && <Check className="w-3.5 h-3.5" />}</span>
              </button>;
            })}
          </div>
        </section>

        {error && <div className="mt-4 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">{error}</div>}
        <button disabled={busy || loadingPrinters} className="w-full mt-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium">{busy ? 'Preparing your workspace…' : 'Finish setup & open Printomatic'}</button>
        <p className="text-[10px] text-slate-500 mt-3 text-center flex items-center justify-center gap-1"><Wifi className="w-3 h-3" /> Your details stay tied to your signed-in shop. If no printer is available yet, you can add one later from Printers & Trays.</p>
      </form>
    </div>
  );
}
