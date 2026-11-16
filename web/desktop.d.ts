export {};
declare global {
  interface Window {
    nexusDesktop?: {
      chooseRepository: () => Promise<string | null>;
      openLink: (url: string) => Promise<void>;
      openView: (selection: {
        view: string;
        project: string;
        chat: string;
      }) => Promise<void>;
    };
  }
}
