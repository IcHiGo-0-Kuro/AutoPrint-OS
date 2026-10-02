export type ColorMode = 'bw' | 'color';
export type DuplexMode = 'single' | 'duplex';
export type PagePerSide = 1 | 2 | 4;
export type Orientation = 'portrait' | 'landscape';

export type JobStatus = 'pending_quote' | 'pending_payment' | 'queued' | 'spooling' | 'printing' | 'printed_ready' | 'completed' | 'cancelled';

export interface PrintJob {
  id: string; tokenNumber: string; customerName: string; customerPhone: string; fileName: string; fileSize: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'image'; localFilePath: string; pageCount: number; copies: number;
  colorMode: ColorMode; duplex: DuplexMode; pagesPerSide: PagePerSide; orientation: Orientation; pageRange: string;
  printCost: number; platformFee: number; totalAmount: number;
  paymentStatus: 'unpaid' | 'paid' | 'refunded'; paymentMethod?: 'UPI_QR' | 'CASH' | 'WALLET'; paymentTxnId?: string;
  jobStatus: JobStatus; printerId: string; printerName: string; currentPagePrinting?: number; totalPagesToPrint: number;
  traySlot: string; headerStamped: boolean; separatorSheetIncluded: boolean; isStapled?: boolean; notes?: string;
  createdAt: string; printedAt?: string; completedAt?: string;
}

export interface PrinterDevice {
  id: string; name: string; brand: string; model: string;
  connectionType: 'USB_DIRECT' | 'NETWORK_LAN' | 'WIFI'; ipOrPort: string;
  supportedModes: ('bw' | 'color')[]; status: 'ready' | 'printing' | 'paper_low' | 'offline';
  paperTraySheets: number; tonerLevelPercent: number; activeJobId?: string;
}

export interface ShopProfile {
  id: string; shopName: string; ownerName: string; collegeCampus: string; city: string;
  whatsappNumber: string; upiVpa: string; isWhatsAppConnected: boolean;
  rates: { bwSingle: number; bwDuplex: number; colorSingle: number; colorDuplex: number };
  automationSettings: {
    autoSpoolEnabled: boolean; headerStampEnabled: boolean; headerStampFontSize: number;
    headerStampFormat: string; separatorSheetEnabled: boolean; autoNotifyOnComplete: boolean; soundAlerts: boolean;
  };
  subscription: {
    plan: 'starter' | 'pro' | 'enterprise'; status: 'active' | 'trial'; nextBillingDate: string;
    prepaidWalletBalance: number; lifetimePlatformFeePaid: number; totalOrdersHandled: number;
  };
}

export interface WhatsAppMessage {
  id: string; sender: 'customer' | 'bot' | 'system'; timestamp: string; text?: string;
  fileAttachment?: { name: string; size: string; type: 'pdf' | 'docx' | 'pptx' | 'image'; pages: number };
  interactiveAction?: { type: 'spec_selection' | 'qr_payment' | 'order_token'; jobId?: string; amount?: number; token?: string };
}

export interface PlatformFeeLedgerEntry {
  id: string; orderId: string; tokenNumber: string; shopName: string; customerPhone: string;
  orderAmount: number; platformFee: number; feeFormula: string;
  settlementMethod: 'PREPAID_WALLET_DEDUCT' | 'UPI_SPLIT'; status: 'settled' | 'pending'; timestamp: string;
}
