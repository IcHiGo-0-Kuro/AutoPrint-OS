import { useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, CircleHelp, Gauge, ListOrdered, MessageSquare, Moon, Palette, Printer, Settings, Sliders, Sun, Wallet, Cpu } from 'lucide-react';
import { ShopProfile } from '../types';
import { formatINRCompact } from '../utils/format';

export type NavTab = 'spooler' | 'whatsapp' | 'orders' | 'printers' | 'rates' | 'saas_billing';
export type AppTheme = 'midnight' | 'graphite' | 'aurora' | 'light';

type P = {
  currentTab: NavTab;
  setCurrentTab: (t: NavTab) => void;
  shopProfile: ShopProfile;
  activeQueueCount: number;
  readyForPickupCount: number;
  onOpenSettings: () => void;
};

const themes: { id: AppTheme; label: string; description: string }[] = [
  { id: 'midnight', label: 'Midnight', description: 'Deep indigo' },
  { id: 'graphite', label: 'Graphite', description: 'Neutral dark' },
  { id: 'aurora', label: 'Aurora', description: 'Cool teal' },
  { id: 'light', label: 'Light', description: 'Bright workspace' },
];

export function NavigationSidebar(p: P) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('autoprint.sidebar.collapsed') === 'true');
  const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem('autoprint.theme') as AppTheme) || 'midnight');
  const [showThemes, setShowThemes] = useState(false);

  useEffect(() => {
    localStorage.setItem('autoprint.sidebar.collapsed', String(collapsed));
    window.dispatchEvent(new CustomEvent('autoprint-sidebar', { detail: { collapsed } }));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem('autoprint.theme', theme);
    document.documentElement.dataset.autoprintTheme = theme;
  }, [theme]);

  const items: [NavTab, string, typeof Printer][] = [
    ['spooler', 'Print Spooler', Printer],
    ['orders', 'Orders & Queue', ListOrdered],
    ['printers', 'Printers & Trays', Cpu],
    ['whatsapp', 'WhatsApp', MessageSquare],
    ['rates', 'Rates & Automation', Sliders],
    ['saas_billing', 'Billing & Wallet', Wallet],
  ];

  const groups = [
    { title: 'WORKSPACE', ids: ['spooler', 'orders'] as NavTab[] },
    { title: 'OPERATIONS', ids: ['printers', 'whatsapp', 'rates'] as NavTab[] },
    { title: 'BUSINESS', ids: ['saas_billing'] as NavTab[] },
  ];

  const itemMap = new Map(items.map((item) => [item[0], item]));

  return (
    <aside className={`autoprint-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Main navigation">
      <div className="autoprint-sidebar-brand">
        <div className="autoprint-shop-mark">{p.shopProfile.shopName.charAt(0).toUpperCase()}</div>
        {!collapsed && <div className="min-w-0"><h2 className="text-sm font-semibold truncate">{p.shopProfile.shopName}</h2><div className="flex items-center gap-1 text-[11px] text-slate-400"><Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{p.shopProfile.collegeCampus}</span></div></div>}
        <button className="autoprint-icon-button ml-auto" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && <div className="autoprint-sidebar-stats"><div><span>B&W</span><b>₹{p.shopProfile.rates.bwDuplex.toFixed(2)}</b></div><div><span>Color</span><b>₹{p.shopProfile.rates.colorSingle.toFixed(2)}</b></div></div>}

      <nav className="autoprint-sidebar-nav">
        {groups.map((group) => (
          <div key={group.title} className="autoprint-nav-group">
            {!collapsed && <div className="autoprint-nav-label">{group.title}</div>}
            {group.ids.map((id) => {
              const [, label, Icon] = itemMap.get(id)!;
              const active = p.currentTab === id;
              return (
                <button key={id} onClick={() => p.setCurrentTab(id)} className={`autoprint-nav-item ${active ? 'is-active' : ''}`} title={collapsed ? label : undefined} aria-label={label}>
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && id === 'spooler' && p.activeQueueCount > 0 && <span className="autoprint-nav-badge">{p.activeQueueCount}</span>}
                  {!collapsed && id === 'orders' && p.readyForPickupCount > 0 && <span className="autoprint-nav-badge ready">{p.readyForPickupCount}</span>}
                  {!collapsed && id === 'whatsapp' && <span className={`autoprint-nav-status ${p.shopProfile.isWhatsAppConnected ? 'live' : ''}`}>{p.shopProfile.isWhatsAppConnected ? 'Live' : 'Offline'}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="autoprint-sidebar-footer">
        <button className={`autoprint-nav-item ${showThemes ? 'is-active' : ''}`} onClick={() => setShowThemes(!showThemes)} title={collapsed ? 'Appearance' : undefined}>
          <Palette className="w-[18px] h-[18px] shrink-0" />{!collapsed && <span>Appearance</span>}
        </button>
        {showThemes && <div className="autoprint-theme-panel">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-2">Theme</div>
          {themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id)} className={`autoprint-theme-option ${theme === item.id ? 'is-selected' : ''}`}><span className={`autoprint-theme-dot theme-${item.id}`} /><span className="min-w-0 text-left"><b>{item.label}</b><small>{item.description}</small></span></button>)}
        </div>}
        <button className="autoprint-nav-item" onClick={p.onOpenSettings} title={collapsed ? 'Settings' : undefined}><Settings className="w-[18px] h-[18px] shrink-0" />{!collapsed && <span>Settings</span>}</button>
        <button className="autoprint-nav-item" title={collapsed ? 'Help' : undefined}><CircleHelp className="w-[18px] h-[18px] shrink-0" />{!collapsed && <span>Help</span>}</button>
        {!collapsed && <div className="autoprint-sidebar-wallet"><div><span>Platform wallet</span><b>{formatINRCompact(p.shopProfile.subscription.prepaidWalletBalance)}</b></div><div className="autoprint-online"><span /> Desktop ready</div></div>}
      </div>
    </aside>
  );
}
