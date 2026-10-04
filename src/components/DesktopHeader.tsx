import { useEffect, useState } from 'react';
import { Bell, Command, Maximize2, Printer, Volume2, VolumeX, Wifi } from 'lucide-react';
import { soundManager } from '../utils/audio';

type P = { shopName: string; isWhatsAppConnected: boolean; activeJobsCount: number };

export function DesktopHeader(p: P) {
  const [time, setTime] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="autoprint-header">
      <div className="flex items-center gap-3 min-w-0">
        <div className="autoprint-header-mark"><Printer className="w-4 h-4" /></div>
        <div className="min-w-0"><b className="text-sm">AutoPrint OS</b><div className="text-[10px] text-slate-500 truncate">{p.shopName} · Windows workstation</div></div>
      </div>

      <button className="autoprint-command-bar" title="Search and commands">
        <Command className="w-3.5 h-3.5" /><span>Search orders, jobs, printers…</span><kbd>Ctrl K</kbd>
      </button>

      <div className="flex items-center gap-1.5">
        <span className="autoprint-header-status"><Wifi className={`w-3.5 h-3.5 ${p.isWhatsAppConnected ? 'text-emerald-400' : 'text-amber-400'}`} />{p.isWhatsAppConnected ? 'WhatsApp live' : 'WhatsApp offline'}</span>
        {p.activeJobsCount > 0 && <span className="autoprint-header-jobs"><Printer className="w-3 h-3" />{p.activeJobsCount} active</span>}
        <button className="autoprint-header-icon" title="Notifications"><Bell className="w-4 h-4" /></button>
        <button className="autoprint-header-icon" title={audioEnabled ? 'Mute sounds' : 'Enable sounds'} onClick={() => { const next = !audioEnabled; setAudioEnabled(next); soundManager.setEnabled(next); }}>{audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
        <button className="autoprint-header-icon" title="Window controls"><Maximize2 className="w-4 h-4" /></button>
        <span className="hidden xl:block text-[11px] font-mono text-slate-500 ml-1">{time}</span>
      </div>
    </header>
  );
}
