import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNav: boolean;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setMobileNav: (v: boolean) => void;
}

function applyTheme(t: Theme): void {
  // AirData is a premium black experience — always stay dark.
  // Light mode is intentionally disabled for pixel-perfect contrast.
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';
  void t;
}

export const useUiStore = create<UiState>()((set) => ({
  theme: 'dark',
  sidebarCollapsed: false,
  mobileNav: false,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme: 'dark' });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNav: (mobileNav) => set({ mobileNav }),
}));

export { applyTheme };
