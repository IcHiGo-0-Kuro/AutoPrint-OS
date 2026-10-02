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
