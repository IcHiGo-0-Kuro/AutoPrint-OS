import { useState, useCallback, useEffect } from 'react';
import { DesktopHeader } from './components/DesktopHeader';
import { NavigationSidebar, NavTab } from './components/NavigationSidebar';
import { SpoolerMonitor } from './components/SpoolerMonitor';
import { OrdersTable } from './components/OrdersTable';
import { WhatsAppHub } from './components/WhatsAppHub';
import { PrinterSettings } from './components/PrinterSettings';
import { SaaSBillingView } from './components/SaaSBillingView';
import { JobSlipModal } from './components/JobSlipModal';
import { ShopSettingsModal } from './components/ShopSettingsModal';
import { initialShopProfile, initialPrinters, initialPrintJobs, initialPlatformFeeLedger } from './data/mockData';
import { PrintJob, PrinterDevice, ShopProfile, PlatformFeeLedgerEntry } from './types';
import { soundManager } from './utils/audio';
import { AuthGate } from './components/AuthGate';
import { ShopSetupGate } from './components/ShopSetupGate';
import { getStoredSession, signOut } from './lib/supabase';
import { loadWorkspace, registerCurrentDevice, syncWhatsAppDocuments, notifyNoPrinter, enqueueNativePrint, reconcileNativePrintQueue, updateJobStatus as persistJobStatus, updateStapled as persistStapled, addPrinter as persistPrinter, saveSettings as persistSettings } from './lib/autoprintRepository';
import { NativeAgentStatus } from './components/NativeAgentStatus';
import { NativeFilePicker } from './components/NativeFilePicker';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('spooler');
  const [shopProfile, setShopProfile] = useState<ShopProfile>(initialShopProfile);
  const [printers, setPrinters] = useState<PrinterDevice[]>(initialPrinters);
  const [jobs, setJobs] = useState<PrintJob[]>(initialPrintJobs);
  const [feeLedger, setFeeLedger] = useState<PlatformFeeLedgerEntry[]>(initialPlatformFeeLedger);
  const [inspectedJob, setInspectedJob] = useState<PrintJob | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(Boolean(getStoredSession()));
  const [workspaceError, setWorkspaceError] = useState('');
  const [connectedToCloud, setConnectedToCloud] = useState(false);
  const [needsShopSetup, setNeedsShopSetup] = useState(false);

  useEffect(() => {
    if (!getStoredSession()) return;
    let cancelled = false;
    setWorkspaceLoading(true);
    loadWorkspace()
      .then((workspace) => {
        if (cancelled) return;
        setShopProfile(workspace.shop);
        setPrinters(workspace.printers);
        setJobs(workspace.jobs);
        setConnectedToCloud(true);
        setWorkspaceError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setConnectedToCloud(false);
        setWorkspaceError(error instanceof Error ? error.message : 'Could not load the shop workspace.');
        if (error instanceof Error && error.message.includes('not assigned to a shop')) setNeedsShopSetup(true);
      })
      .finally(() => { if (!cancelled) setWorkspaceLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const reloadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const workspace = await loadWorkspace();
      setShopProfile(workspace.shop);
      setPrinters(workspace.printers);
      setJobs(workspace.jobs);
      setConnectedToCloud(true);
      setWorkspaceError('');
      setNeedsShopSetup(false);
    } catch (error) {
      setConnectedToCloud(false);
      setWorkspaceError(error instanceof Error ? error.message : 'Could not load the shop workspace.');
      if (error instanceof Error && error.message.includes('not assigned to a shop')) setNeedsShopSetup(true);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!connectedToCloud || !window.autoPrintNative || !shopProfile.id) return;

    let active = true;
    const sync = async () => {
      try {
        const result = await syncWhatsAppDocuments();
        if (!active) return;
        if (result.failed > 0) {
          setWorkspaceError(`${result.failed} WhatsApp document import(s) failed; they will be retried.`);
        }
        if (result.documents.length && printers.length === 0) {
          for (const document of result.documents) {
            try {
              if (document.path) await window.autoPrintNative?.files.open(document.path);
              await notifyNoPrinter(document.id);
            } catch (error) {
              if (active) setWorkspaceError(error instanceof Error ? error.message : 'Could not open the WhatsApp document.');
            }
          }
        }
      } catch (error) {
        if (active) setWorkspaceError(error instanceof Error ? error.message : 'WhatsApp document synchronization failed.');
      }
    };

    void sync();
    const interval = window.setInterval(() => { void sync(); }, 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [connectedToCloud, shopProfile.id, printers.length]);

  useEffect(() => {
    if (!connectedToCloud || !window.autoPrintNative || !shopProfile.id) return;

    let active = true;
    const heartbeat = async () => {
      try {
        await registerCurrentDevice(shopProfile.id);
      } catch (error) {
        if (active) {
          setWorkspaceError(error instanceof Error ? `Desktop device heartbeat failed: ${error.message}` : 'Desktop device heartbeat failed.');
        }
      }
    };

    void heartbeat();
    const interval = window.setInterval(() => { void heartbeat(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [connectedToCloud, shopProfile.id]);

  useEffect(() => {
    if (!connectedToCloud || !window.autoPrintNative || !shopProfile.id || !jobs.length) return;
    let active = true;
    const reconcile = async () => {
      try {
        const result = await reconcileNativePrintQueue(jobs, shopProfile.automationSettings.autoSpoolEnabled);
        if (!active || !result?.updates.length) return;
        setJobs((prev) => prev.map((job) => {
          const update = result.updates.find((item) => item.id === job.id);
          if (!update) return job;
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return {
            ...job,
            jobStatus: update.status,
            printedAt: update.status === 'printed_ready' ? now : job.printedAt,
          };
        }));
      } catch (error) {
        if (active) setWorkspaceError(error instanceof Error ? error.message : 'Native print queue reconciliation failed.');
      }
    };
    void reconcile();
    const interval = window.setInterval(() => { void reconcile(); }, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [connectedToCloud, shopProfile.id, shopProfile.automationSettings.autoSpoolEnabled, jobs]);
  
  const activeQueueCount = jobs.filter((j) => j.jobStatus === 'queued' || j.jobStatus === 'printing').length;
  const readyForPickupCount = jobs.filter((j) => j.jobStatus === 'printed_ready').length;

  const handleUpdateJobStatus = useCallback((jobId: string, status: PrintJob['jobStatus']) => {
    setJobs((prev) => prev.map((j) => {
      if (j.id !== jobId) return j;
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (connectedToCloud) void persistJobStatus(jobId, status).catch((error) => setWorkspaceError(error instanceof Error ? error.message : 'Could not save job status.'));
      return { ...j, jobStatus: status, printedAt: status === 'printed_ready' ? now : j.printedAt, completedAt: status === 'completed' ? now : j.completedAt };
    }));
  }, [connectedToCloud]);

  const handleMarkStapled = useCallback((jobId: string) => {
    setJobs((prev) => prev.map((j) => {
      if (j.id !== jobId) return j;
      const next = !j.isStapled;
      if (connectedToCloud) void persistStapled(jobId, next).catch((error) => setWorkspaceError(error instanceof Error ? error.message : 'Could not save stapled state.'));
      return { ...j, isStapled: next };
    }));
  }, [connectedToCloud]);

  const handleTriggerManualPrint = useCallback((jobId: string) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    if (!printers.length || !job.printerName || job.printerName === 'Unassigned') {
      setWorkspaceError('No printer selected. Select a Windows printer in Printers & Trays before printing.');
      return;
    }
    if (!window.autoPrintNative || !job.localFileId) {
      soundManager.playPaperFeedTick();
      handleUpdateJobStatus(jobId, 'printing');
      setTimeout(() => {
        soundManager.playPrintCompleted();
        handleUpdateJobStatus(jobId, 'printed_ready');
      }, 2500);
      return;
    }
    soundManager.playPaperFeedTick();
    handleUpdateJobStatus(jobId, 'printing');
    void enqueueNativePrint(job)
      .then(() => {
        const poll = window.setInterval(async () => {
          try {
            const queue = await window.autoPrintNative?.print.queue();
            const current = queue?.find((item) => item.id === jobId);
            if (!current || current.status === 'queued' || current.status === 'printing') return;
            window.clearInterval(poll);
            if (current.status === 'completed') {
              soundManager.playPrintCompleted();
              handleUpdateJobStatus(jobId, 'printed_ready');
            } else {
              handleUpdateJobStatus(jobId, 'cancelled');
              setWorkspaceError(current.error || 'Native print failed.');
            }
          } catch (error) {
            window.clearInterval(poll);
            handleUpdateJobStatus(jobId, 'cancelled');
            setWorkspaceError(error instanceof Error ? error.message : 'Could not read native print queue.');
          }
        }, 1000);
      })
      .catch((error) => {
        handleUpdateJobStatus(jobId, 'cancelled');
        setWorkspaceError(error instanceof Error ? error.message : 'Could not queue native print.');
      });
  }, [jobs, printers.length, handleUpdateJobStatus]);

  const handleTopUpWallet = useCallback((amount: number) => {
    setShopProfile((prev) => ({ ...prev, subscription: { ...prev.subscription, prepaidWalletBalance: prev.subscription.prepaidWalletBalance + amount } }));
  }, []);

  const handleAddPrinter = useCallback((newPrinter: PrinterDevice) => {
    setPrinters((prev) => [...prev, newPrinter]);
    if (connectedToCloud) void persistPrinter(shopProfile.id, newPrinter).catch((error) => setWorkspaceError(error instanceof Error ? error.message : 'Could not save printer.'));
  }, [connectedToCloud, shopProfile.id]);

  const handleRunTestCalibration = useCallback((printerId: string) => {
    setPrinters((prev) => prev.map((p) => (p.id === printerId ? { ...p, paperTraySheets: Math.max(0, p.paperTraySheets - 2) } : p)));
  }, []);

  if (!getStoredSession()) return <AuthGate onAuthenticated={reloadWorkspace} />;
  if (needsShopSetup) return <ShopSetupGate onCreated={reloadWorkspace} />;

  return (
    <div className="autoprint-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <div className="h-8 px-4 flex items-center justify-between bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${connectedToCloud ? 'bg-emerald-400' : 'bg-amber-400'}`} />{connectedToCloud ? 'Supabase connected · shop workspace synced' : workspaceLoading ? 'Connecting to Supabase…' : workspaceError || 'Cloud connection unavailable'}</div>
        <div className="flex items-center gap-4"><NativeAgentStatus /><button onClick={() => { signOut(); window.location.reload(); }} className="hover:text-white">Sign out</button></div>
      </div>
      <DesktopHeader shopName={shopProfile.shopName} isWhatsAppConnected={shopProfile.isWhatsAppConnected} activeJobsCount={activeQueueCount} />
        <div className="flex-1 flex overflow-hidden">
          <NavigationSidebar currentTab={currentTab} setCurrentTab={setCurrentTab} shopProfile={shopProfile} activeQueueCount={activeQueueCount} readyForPickupCount={readyForPickupCount} onOpenSettings={() => setShowSettingsModal(true)} />
          <main className="flex-1 overflow-y-auto p-6 bg-slate-950/90">
            <div className="max-w-7xl mx-auto space-y-6"><NativeFilePicker />
              {currentTab === 'spooler' && <SpoolerMonitor jobs={jobs} printers={printers} shopProfile={shopProfile} onUpdateJobStatus={handleUpdateJobStatus} onMarkStapled={handleMarkStapled} onOpenJobInspection={(job) => setInspectedJob(job)} onTriggerManualPrint={handleTriggerManualPrint} />}
              {currentTab === 'whatsapp' && <WhatsAppHub shopProfile={shopProfile} />}
              {currentTab === 'orders' && <OrdersTable jobs={jobs} shopProfile={shopProfile} onOpenJobInspection={(job) => setInspectedJob(job)} onUpdateJobStatus={handleUpdateJobStatus} onMarkStapled={handleMarkStapled} onTriggerManualPrint={handleTriggerManualPrint} />}
              {currentTab === 'printers' && <PrinterSettings printers={printers} shopProfile={shopProfile} onAddPrinter={handleAddPrinter} onRunTestCalibration={handleRunTestCalibration} />}
              {currentTab === 'rates' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6"><div><h3 className="text-base font-semibold text-white">Xerox Page Pricing & Automation Configuration</h3><p className="text-xs text-slate-400 mt-0.5">These rates are used by the WhatsApp bot to automatically quote prices and generate UPI QR codes.</p></div><button onClick={() => setShowSettingsModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors">Edit Shop Rates</button></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">B&W Single Sided</span><span className="text-2xl font-mono font-bold text-white">₹{shopProfile.rates.bwSingle.toFixed(2)}</span><span className="text-[11px] text-slate-500 block mt-1">per physical page</span></div>
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">B&W Duplex (Both sides)</span><span className="text-2xl font-mono font-bold text-emerald-400">₹{shopProfile.rates.bwDuplex.toFixed(2)}</span><span className="text-[11px] text-slate-500 block mt-1">₹1.00/side (Student discount)</span></div>
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">Color Single Sided</span><span className="text-2xl font-mono font-bold text-white">₹{shopProfile.rates.colorSingle.toFixed(2)}</span><span className="text-[11px] text-slate-500 block mt-1">High-res inkjet/laser</span></div>
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">Color Duplex</span><span className="text-2xl font-mono font-bold text-white">₹{shopProfile.rates.colorDuplex.toFixed(2)}</span><span className="text-[11px] text-slate-500 block mt-1">Both sides color</span></div>
                  </div>
                  <div className="mt-6 p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-2"><div className="font-semibold text-white">Automation Guarantee:</div><ul className="space-y-1 text-slate-400 list-disc list-inside"><li>Token Header: Automatically stamped at top of every single page (8pt font).</li><li>Job Separator: Extra banner slip sheet automatically appended to prevent paper mixing.</li><li>Platform Cut: ₹0.50 for orders &lt;₹10, ₹1.00 for orders ≥₹10 routed to SaaS founder.</li></ul></div>
                </div>
              )}
              {currentTab === 'saas_billing' && <SaaSBillingView shopProfile={shopProfile} feeLedger={feeLedger} onTopUpWallet={handleTopUpWallet} />}
            </div>
          </main>
        </div>
      {inspectedJob && <JobSlipModal job={inspectedJob} shopProfile={shopProfile} onClose={() => setInspectedJob(null)} onMarkStapled={handleMarkStapled} onReprint={handleTriggerManualPrint} />}
      {showSettingsModal && <ShopSettingsModal shopProfile={shopProfile} onSave={(updated) => { setShopProfile(updated); if (connectedToCloud) void persistSettings(updated).catch((error) => setWorkspaceError(error instanceof Error ? error.message : 'Could not save shop settings.')); }} onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
}