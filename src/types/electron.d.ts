export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  selectDirectory: () => Promise<string | null>;
  onDirectorySelected: (callback: (dirPath: string) => void) => () => void;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
