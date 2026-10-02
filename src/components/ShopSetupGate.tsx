import { FormEvent, useState } from 'react';
import { Store } from 'lucide-react';
import { createShop } from '../lib/autoprintRepository';

export function ShopSetupGate({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState(''); const [city, setCity] = useState(''); const [campus, setCampus] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await createShop(name, city, campus); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not create the shop.'); } finally { setBusy(false); } };
  return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
    <Store className="w-9 h-9 text-indigo-400 mb-4" /><h1 className="text-xl font-semibold">Set up your shop</h1><p className="text-sm text-slate-400 mt-2 mb-6">Create the first isolated workspace for your AutoPrint OS account.</p>
    <label className="block text-xs text-slate-400 mb-1">Shop name</label><input required value={name} onChange={e=>setName(e.target.value)} className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" />
    <label className="block text-xs text-slate-400 mb-1">City</label><input value={city} onChange={e=>setCity(e.target.value)} className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" />
    <label className="block text-xs text-slate-400 mb-1">Campus / location</label><input value={campus} onChange={e=>setCampus(e.target.value)} className="w-full mb-4 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800" />
    {error && <div className="mb-4 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg p-3">{error}</div>}
    <button disabled={busy} className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium">{busy ? 'Creating…' : 'Create shop workspace'}</button>
  </form></div>;
}
