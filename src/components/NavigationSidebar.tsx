import { useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, CircleHelp, ListOrdered, MessageSquare, Palette, Printer, Settings, Sliders, Wallet, Cpu } from 'lucide-react';
import { ShopProfile } from '../types';
import { formatINRCompact } from '../utils/format';

export type NavTab = 'spooler' | 'whatsapp' | 'orders' | 'printers' | 'rates' | 'saas_billing';
export type AppTheme = 'graphite' | 'light' | 'hacker' | 'crimson';

type P = {
  currentTab: NavTab;
  setCurrentTab: (t: NavTab) => void;
  shopProfile: ShopProfile;
  activeQueueCount: number;
  readyForPickupCount: number;
  onOpenSettings: () => void;
  shopOptions: Array<{ shopId: string; shopName: string; role: string }>;
  activeShopId: string;
  onSelectShop: (shopId: string) => void;
};

const themes: { id: AppTheme; label: string; description: string }[] = [
  { id: 'light', label: 'Bright', description: 'Clean light workspace' },
  { id: 'graphite', label: 'Violet', description: 'Elegant violet accents' },
  { id: 'hacker', label: 'Hacker Green', description: 'Pure black · neon green' },
  { id: 'crimson', label: 'Crimson Red', description: 'Pure black · vivid red' },
];

export function NavigationSidebar(p: P) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('autoprint.sidebar.collapsed') === 'true');
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('autoprint.theme');
    if (saved === 'midnight') return 'hacker';
    if (saved === 'aurora') return 'crimson';
    return saved === 'light' || saved === 'graphite' || saved === 'hacker' || saved === 'crimson' ? saved : 'graphite';
  });
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
        {!collapsed ? (
          <div className="w-full">
            <div className="flex items-center justify-between gap-2">
              <img src="./printomatic-logo.svg" alt="Printomatic" className="h-11 w-auto max-w-[190px] object-contain object-left" />
              <button className="autoprint-icon-button shrink-0" onClick={() => setCollapsed(true)} title="Collapse sidebar" aria-label="Collapse sidebar">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2 min-w-0">
              <div className="autoprint-shop-mark">{p.shopProfile.shopName.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <select
                  value={p.activeShopId}
                  onChange={(event) => p.onSelectShop(event.target.value)}
                  disabled={p.shopOptions.length <= 1}
                  className="w-full bg-transparent text-sm font-semibold truncate outline-none disabled:appearance-none"
                  aria-label="Active shop workspace"
                >
                  {p.shopOptions.map((shop) => <option key={shop.shopId} value={shop.shopId} className="bg-slate-900">{shop.shopName} · {shop.role}</option>)}
                </select>
                <div className="flex items-center gap-1 text-[11px] text-slate-400"><Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{p.shopProfile.collegeCampus}</span></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-2">
            <img src="./printomatic-mark.svg" alt="Printomatic" className="h-10 w-10 object-contain" />
            <button className="autoprint-icon-button" onClick={() => setCollapsed(false)} title="Expand sidebar" aria-label="Expand sidebar">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
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
