import { MessageSquare, Wifi, ShieldCheck, Webhook } from 'lucide-react';
import { ShopProfile } from '../types';

type P = { shopProfile: ShopProfile; onToggleWhatsAppConnection: () => void };

export function WhatsAppHub(p: P) {
  return <div className="space-y-6">
    <div><div className="autoprint-eyebrow">OPERATIONS</div><h1 className="text-2xl font-bold tracking-tight">WhatsApp Bot Hub</h1><p className="text-sm text-slate-400 mt-1">Manage the cloud intake and customer conversation layer. The production flow stays separate from the desktop print engine.</p></div>
    <div className="grid md:grid-cols-2 gap-5">
      <div className="autoprint-panel p-6">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><MessageSquare className="text-emerald-400" /></div><div><b>WhatsApp connection</b><p className="text-xs text-slate-400 mt-0.5">{p.shopProfile.whatsappNumber || 'No number configured'}</p></div></div>
        <div className="mt-6 flex items-center gap-2 text-xs"><span className={`w-2 h-2 rounded-full ${p.shopProfile.isWhatsAppConnected ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.55)]' : 'bg-amber-400'}`} />{p.shopProfile.isWhatsAppConnected ? 'Connected and ready' : 'Not connected'}</div>
        <button onClick={p.onToggleWhatsAppConnection} className="mt-5 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition-colors">{p.shopProfile.isWhatsAppConnected ? 'Disconnect' : 'Connect WhatsApp'}</button>
      </div>
      <div className="autoprint-panel p-6">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center"><Webhook className="text-indigo-400" /></div><div><b>Production webhook</b><p className="text-xs text-slate-400 mt-0.5">Cloud-controlled intake endpoint</p></div></div>
        <div className="mt-5 space-y-3 text-xs text-slate-400"><div className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />Customer messages stay in the cloud workflow.</div><div className="flex gap-2"><Wifi className="w-4 h-4 text-indigo-400 shrink-0" />Paid jobs can flow into the desktop queue without a simulator.</div></div>
        <div className="mt-5 px-3 py-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-500">Real provider/webhook integration is the next production layer.</div>
      </div>
    </div>
  </div>;
}
