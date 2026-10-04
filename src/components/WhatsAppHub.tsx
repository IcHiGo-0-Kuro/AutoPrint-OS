import { useEffect, useState } from 'react';
import { CheckCircle2, MessageSquare, ShieldCheck, Webhook, Wifi } from 'lucide-react';
import { ShopProfile } from '../types';
import { getWhatsAppConnection, saveWhatsAppConnection, WhatsAppConnection } from '../lib/whatsapp';

type P = { shopProfile: ShopProfile };

export function WhatsAppHub({ shopProfile }: P) {
  const [phoneNumber, setPhoneNumber] = useState(shopProfile.whatsappNumber || '');
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPhoneNumber(shopProfile.whatsappNumber || '');
    void getWhatsAppConnection(shopProfile.id).then(setConnection).catch(() => setConnection(null));
  }, [shopProfile.id, shopProfile.whatsappNumber]);

  const connect = async () => {
    setSaving(true);
    setMessage('');
    try {
      const saved = await saveWhatsAppConnection(shopProfile.id, phoneNumber);
      setConnection(saved);
      setMessage('WhatsApp number registered. The provider webhook can now be attached to this shop.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the WhatsApp number.');
    } finally {
      setSaving(false);
    }
  };

  const connected = connection?.status === 'connected' || shopProfile.isWhatsAppConnected;

  return <div className="space-y-6">
    <div>
      <div className="autoprint-eyebrow">OPERATIONS · PHASE 2</div>
      <h1 className="text-2xl font-bold tracking-tight">WhatsApp Intake</h1>
      <p className="text-sm text-slate-400 mt-1">Connect the shop’s WhatsApp number first. Incoming customers will become conversations, orders and document records automatically.</p>
    </div>

    <div className="grid xl:grid-cols-3 gap-5">
      <div className="autoprint-panel p-6 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><MessageSquare className="text-emerald-400" /></div>
          <div><b>Shop WhatsApp number</b><p className="text-xs text-slate-400 mt-0.5">Use international format, including country code.</p></div>
        </div>
        <div className="mt-6 flex gap-3">
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+91 98765 43210" className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <button onClick={connect} disabled={saving} className="px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold transition-colors">{saving ? 'Saving…' : 'Register number'}</button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {connected ? 'Webhook connection active' : connection ? 'Number saved · waiting for provider connection' : 'Not configured'}
        </div>
        {message && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">{message}</div>}
      </div>

      <div className="autoprint-panel p-6">
        <div className="flex items-center gap-3"><Webhook className="text-indigo-400" /><div><b>Webhook intake</b><p className="text-xs text-slate-400">Cloud → AutoPrint</p></div></div>
        <div className="mt-5 space-y-3 text-xs text-slate-400">
          <div className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />Messages are stored against the correct shop.</div>
          <div className="flex gap-2"><Wifi className="w-4 h-4 text-indigo-400 shrink-0" />Duplicate provider messages are ignored.</div>
          <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />Documents become order records without storing their bytes in Supabase.</div>
        </div>
      </div>
    </div>

    <div className="autoprint-panel p-6">
      <h3 className="font-semibold">Phase 2 guided order agent</h3>
      <div className="grid md:grid-cols-5 gap-3 mt-5 text-xs">
        {['Name','Document','Copies','Color + paper','Duplex + confirm'].map((item, i) => <div key={item} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="text-slate-500 mb-2">0{i + 1}</div><div className="font-medium">{item}</div></div>)}
      </div>
    </div>
  </div>;
}
