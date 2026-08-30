import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppTheme = 'dark' | 'light' | 'hc-dark' | 'hc-light';

export interface ThemeOption {
  id: AppTheme;
  name: string;
  category: 'Dark' | 'Light' | 'High Contrast';
  icon: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    name: 'VS Code Dark+ (Default)',
    category: 'Dark',
    icon: '🌙',
    description: 'Classic Dark Theme with deep slate contrast',
  },
  {
    id: 'light',
    name: 'VS Code Light+ (Modern Light)',
    category: 'Light',
    icon: '☀️',
    description: 'Clean crisp Light Theme with high legibility',
  },
  {
    id: 'hc-dark',
    name: 'High Contrast Dark (WCAG AAA)',
    category: 'High Contrast',
    icon: '🔲',
    description: 'Pure black canvas with high-contrast neon borders',
  },
  {
    id: 'hc-light',
    name: 'High Contrast Light (WCAG AAA)',
    category: 'High Contrast',
    icon: '🔳',
    description: 'Pure white canvas with high-contrast sharp borders',
  },
];

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  isDark: boolean;
  isLight: boolean;
  isHighContrast: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  isDark: true,
  isLight: false,
  isHighContrast: false,
});

const STORAGE_THEME_KEY = 'vscode_agent_flow_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved && ['dark', 'light', 'hc-dark', 'hc-light'].includes(saved)) {
        return saved as AppTheme;
      }
    } catch (e) {
      console.warn('Failed to load theme preference:', e);
    }
    return 'dark';
  });

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, newTheme);
    } catch (e) {
      console.warn('Failed to save theme preference:', e);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Remove all previous theme classes
    root.classList.remove(
      'theme-dark', 
      'theme-light', 
      'theme-hc-dark', 
      'theme-hc-light', 
      'vscode-dark', 
      'vscode-light', 
      'vscode-high-contrast', 
      'vscode-high-contrast-light'
    );
    body.classList.remove(
      'theme-dark', 
      'theme-light', 
      'theme-hc-dark', 
      'theme-hc-light', 
      'vscode-dark', 
      'vscode-light', 
      'vscode-high-contrast', 
      'vscode-high-contrast-light'
    );

    // Apply active theme class
    root.classList.add(`theme-${theme}`);
    body.classList.add(`theme-${theme}`);

    // Add standard VS Code classes for native webview styling
    if (theme === 'dark') {
      root.classList.add('vscode-dark');
      body.classList.add('vscode-dark');
    } else if (theme === 'light') {
      root.classList.add('vscode-light');
      body.classList.add('vscode-light');
    } else if (theme === 'hc-dark') {
      root.classList.add('vscode-high-contrast', 'vscode-dark');
      body.classList.add('vscode-high-contrast', 'vscode-dark');
    } else if (theme === 'hc-light') {
      root.classList.add('vscode-high-contrast-light', 'vscode-light');
      body.classList.add('vscode-high-contrast-light', 'vscode-light');
    }
  }, [theme]);

  const isDark = theme === 'dark' || theme === 'hc-dark';
  const isLight = theme === 'light' || theme === 'hc-light';
  const isHighContrast = theme === 'hc-dark' || theme === 'hc-light';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, isLight, isHighContrast }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
