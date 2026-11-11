export {};
declare global {
  interface Window {
    nexusDesktop?: { chooseRepository: () => Promise<string | null> };
  }
}
