export {};

declare global {
  interface Window {
    autoPrintNative?: {
      system: {
        info: () => Promise<{
          platform: string;
          arch: string;
          hostname: string;
          user: string;
          appVersion: string;
          deviceId: string;
        }>;
      };
      files: {
        choose: () => Promise<string[]>;
        stat: (filePath: string) => Promise<{
          path: string;
          name: string;
          size: number;
          modifiedAt: string;
          isFile: boolean;
        }>;
        register: (filePath: string) => Promise<{
          deviceId: string;
          localFileId: string;
          path: string;
          name: string;
          size: number;
          modifiedAt: string;
          fingerprint: string;
          registeredAt: string;
        }>;
        resolve: (localFileId: string) => Promise<{
          localFileId: string;
          path: string;
          name: string;
          size: number;
          modifiedAt: string;
          fingerprint: string;
        } | null>;
      };
      print: {
        enqueue: (input: { jobId: string; localFileId: string; printerName: string; copies?: number }) => Promise<{
          id: string; localFileId: string; printerName: string; copies: number; fileName: string;
          status: 'queued' | 'printing' | 'completed' | 'failed';
          queuedAt: string; startedAt: string | null; completedAt: string | null; error: string | null;
        }>;
        queue: () => Promise<Array<{
          id: string; localFileId: string; printerName: string; copies: number; fileName: string;
          status: 'queued' | 'printing' | 'completed' | 'failed';
          queuedAt: string; startedAt: string | null; completedAt: string | null; error: string | null;
        }>>;
      };
      printers: {
        list: () => Promise<Array<{
          name: string;
          status: number | string;
          driver: string;
          port: string;
          offline: boolean;
        }>>;
        openQueue: (name: string) => Promise<boolean>;
      };
    };
  }
}
