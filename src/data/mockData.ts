import { PrintJob, PrinterDevice, ShopProfile, PlatformFeeLedgerEntry } from '../types';

export const initialShopProfile: ShopProfile = {
  id: '',
  shopName: '',
  ownerName: '',
  collegeCampus: '',
  city: '',
  whatsappNumber: '',
  upiVpa: '',
  isWhatsAppConnected: false,
  rates: { bwSingle: 0, bwDuplex: 0, colorSingle: 0, colorDuplex: 0 },
  automationSettings: {
    autoSpoolEnabled: true,
    headerStampEnabled: true,
    headerStampFontSize: 7,
    headerStampFormat: 'Printomatic #{SHORT_NUMBER}',
    separatorSheetEnabled: true,
    autoNotifyOnComplete: true,
    soundAlerts: true,
  },
  subscription: {
    plan: 'starter',
    status: 'active',
    nextBillingDate: '',
    prepaidWalletBalance: 0,
    lifetimePlatformFeePaid: 0,
    totalOrdersHandled: 0,
  },
};

export const initialPrinters: PrinterDevice[] = [];
export const initialPrintJobs: PrintJob[] = [];
export const initialPlatformFeeLedger: PlatformFeeLedgerEntry[] = [];
