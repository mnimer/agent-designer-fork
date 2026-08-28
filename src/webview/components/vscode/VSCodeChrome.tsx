import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Files, 
  Search, 
  GitFork, 
  Play, 
  Boxes, 
  Settings, 
  User, 
  Bell, 
  CheckCircle,
  HelpCircle,
  Sparkles,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
  RefreshCcw,
  Plus,
  Palette,
  ChevronDown,
  Sun,
  Moon,
  Contrast,
  Check,
  X,
  BookOpen,
  FileCode2,
  Layers,
  Undo2,
  Redo2
} from 'lucide-react';
import { useTheme, THEME_OPTIONS, AppTheme } from '../../context/ThemeContext';
import { AgentFileTab } from '../../types';

interface VSCodeChromeProps {
  children: React.ReactNode;
  activeAgentsCount: number;
  connectionsCount: number;
  onAutoLayout: (direction: 'LR' | 'TB') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onOpenAdvisor: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  fileTabs?: AgentFileTab[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onNewTab?: () => void;
  activeEditorTab?: 'flow' | 'settings';
  onSelectEditorTab?: (tab: 'flow' | 'settings') => void;
  onOpenSettings?: () => void;
}

export const VSCodeChrome: React.FC<VSCodeChromeProps> = ({
  children,
  activeAgentsCount,
  connectionsCount,
  onAutoLayout,
  onZoomIn,
  onZoomOut,
  onFitView,
  onOpenAdvisor,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  fileTabs = [
    { id: 'tab-default', filename: 'workflow.agent', title: 'workflow.agent', nodes: [], edges: [], config: { framework: 'google_adk', language: 'python', outputFolder: './agent_app', includeTests: true, includeDocker: true, useStreaming: true } }
  ],
  activeTabId = 'tab-default',
  onSelectTab,
  onCloseTab,
  onNewTab,
  activeEditorTab = 'flow',
  onSelectEditorTab,
  onOpenSettings,
}) => {
  const { theme, setTheme, isDark, isLight, isHighContrast } = useTheme();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  const activeThemeOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  const currentActiveFile = fileTabs.find((t) => t.id === activeTabId) || fileTabs[0];
  const activeFileName = activeEditorTab === 'settings' ? 'Settings' : (currentActiveFile?.filename || 'workflow.agent');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--vscode-canvas-bg)] text-[var(--vscode-text-secondary)] select-none overflow-hidden font-sans">
      {/* VS Code Title Bar */}
      <div className="h-8 bg-[var(--vscode-title-bar)] border-b border-[var(--vscode-border)] flex items-center justify-between px-3 text-xs text-[var(--vscode-text-muted)] shrink-0 transition-colors">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <div className="flex items-center gap-2 font-semibold text-[var(--vscode-text-primary)]">
            <Bot className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px]">{activeFileName} — Visual Studio Code Agent Flow</span>
          </div>
        </div>

        {/* Center search / Command palette */}
        <div className="hidden md:flex items-center gap-2 px-4 py-1 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-[11px] text-[var(--vscode-text-secondary)] w-80 justify-center shadow-xs">
          <Search className="w-3 h-3 text-[var(--vscode-text-muted)]" />
          <span>{activeFileName}</span>
        </div>

        {/* Right Header Actions: Theme Dropdown & Missing Features Advisor */}
        <div className="flex items-center gap-2 text-[11px]">
          {/* Theme Dropdown Picker */}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--vscode-workbench-bg)] hover:bg-[var(--vscode-hover)] border border-[var(--vscode-border)] text-[var(--vscode-text-primary)] transition-all cursor-pointer font-medium shadow-xs"
              title="Select VS Code Theme"
            >
              <Palette className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs">{activeThemeOption.icon}</span>
              <span className="text-[11px] font-medium hidden sm:inline">{activeThemeOption.name.split(' (')[0]}</span>
              <ChevronDown className={`w-3 h-3 text-[var(--vscode-text-muted)] transition-transform ${isThemeMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isThemeMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] rounded-xl shadow-2xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] border-b border-[var(--vscode-border)] flex items-center justify-between">
                  <span>VS Code Theme Palette</span>
                  <span className="font-mono text-[9px]">Webview API</span>
                </div>

                <div className="space-y-0.5 pt-0.5">
                  {THEME_OPTIONS.map((opt) => {
                    const isSelected = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setTheme(opt.id);
                          setIsThemeMenuOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer group ${
                          isSelected
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/30'
                            : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm shrink-0">{opt.icon}</span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium truncate">{opt.name}</div>
                            <div className="text-[9px] text-[var(--vscode-text-muted)] truncate">{opt.description}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0 ml-1.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Missing Features Advisor Button */}
          <button
            onClick={onOpenAdvisor}
            className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 hover:opacity-90 cursor-pointer font-medium px-2.5 py-1 rounded-md bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] shadow-xs transition-colors"
          >
            <HelpCircle className="w-3 h-3 text-amber-500 dark:text-amber-400" />
            <span className="hidden sm:inline">Missing Advisor</span>
          </button>
        </div>
      </div>

      {/* Main VS Code Workbench Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Activity Bar */}
        <div className="w-12 bg-[var(--vscode-activity-bar)] border-r border-[var(--vscode-border)] flex flex-col justify-between items-center py-2 shrink-0 transition-colors">
          <div className="flex flex-col items-center gap-4 text-[var(--vscode-text-muted)]">
            <button className="p-2 rounded hover:text-[var(--vscode-text-primary)] transition-colors cursor-pointer" title="Explorer">
              <Files className="w-5 h-5" />
            </button>
            <button className="p-2 rounded hover:text-[var(--vscode-text-primary)] transition-colors cursor-pointer" title="Search">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 rounded hover:text-[var(--vscode-text-primary)] transition-colors cursor-pointer" title="Source Control">
              <GitFork className="w-5 h-5" />
            </button>
            {/* Active Agent Flow Icon */}
            <button
              onClick={() => {
                if (onSelectEditorTab) onSelectEditorTab('flow');
                if (onSelectTab && fileTabs[0]) onSelectTab(fileTabs[0].id);
              }}
              className={`relative p-2 rounded transition-all cursor-pointer ${
                activeEditorTab === 'flow'
                  ? 'text-blue-500 border-l-2 border-blue-500 bg-[var(--vscode-workbench-bg)]'
                  : 'hover:text-[var(--vscode-text-primary)] border-l-2 border-transparent'
              }`}
              title="Agent Flow Visual Editor (*.agent)"
            >
              <Bot className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500"></span>
            </button>
            <button className="p-2 rounded hover:text-[var(--vscode-text-primary)] transition-colors cursor-pointer" title="Extensions">
              <Boxes className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 text-[var(--vscode-text-muted)]">
            <button onClick={onOpenAdvisor} className="p-2 rounded hover:text-amber-500 transition-colors cursor-pointer" title="Help & Architectural Advisor">
              <HelpCircle className="w-5 h-5" />
            </button>
            {/* Settings Button in Activity Bar */}
            <button
              onClick={() => {
                if (onOpenSettings) {
                  onOpenSettings();
                } else if (onSelectEditorTab) {
                  onSelectEditorTab('settings');
                }
              }}
              className={`p-2 rounded transition-all cursor-pointer ${
                activeEditorTab === 'settings'
                  ? 'text-blue-500 border-l-2 border-blue-500 bg-[var(--vscode-workbench-bg)]'
                  : 'hover:text-[var(--vscode-text-primary)] border-l-2 border-transparent'
              }`}
              title="Settings: Agent Flow Extension"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Main Canvas Container */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--vscode-canvas-bg)]">
          {/* Editor Tab Strip */}
          <div className="h-9 bg-[var(--vscode-workbench-bg)] border-b border-[var(--vscode-border)] flex items-center justify-between px-2 shrink-0 transition-colors select-none">
            <div className="flex items-center overflow-x-auto no-scrollbar gap-0.5 py-0.5">
              {/* Dynamic .agent File Tabs */}
              {fileTabs.map((tab) => {
                const isTabActive = activeEditorTab === 'flow' && activeTabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-semibold shadow-xs cursor-pointer border-t-2 transition-all ${
                      isTabActive
                        ? 'bg-[var(--vscode-tab-active)] border-blue-500 text-[var(--vscode-text-primary)]'
                        : 'bg-transparent border-transparent text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] hover:bg-[var(--vscode-hover)]'
                    }`}
                    onClick={() => {
                      if (onSelectEditorTab) onSelectEditorTab('flow');
                      if (onSelectTab) onSelectTab(tab.id);
                    }}
                  >
                    <Bot className={`w-3.5 h-3.5 shrink-0 ${isTabActive ? 'text-blue-500' : ''}`} />
                    <span className="truncate max-w-[160px] font-mono text-[11px]">{tab.filename}</span>
                    
                    {/* Close Tab Button */}
                    {fileTabs.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onCloseTab) onCloseTab(tab.id);
                        }}
                        className="p-0.5 rounded hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] opacity-0 group-hover:opacity-100 transition-opacity ml-1 cursor-pointer"
                        title="Close Tab"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Plus button to create new blank .agent tab */}
              {onNewTab && (
                <button
                  type="button"
                  onClick={onNewTab}
                  className="p-1.5 rounded hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] transition-colors cursor-pointer ml-1"
                  title="New .agent File Tab"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Settings Tab (when active) */}
              {activeEditorTab === 'settings' && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold shadow-xs cursor-pointer border-t-2 bg-[var(--vscode-tab-active)] border-blue-500 text-[var(--vscode-text-primary)]"
                >
                  <Settings className="w-3.5 h-3.5 text-blue-500" />
                  <span>Settings</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono">
                    Ext
                  </span>
                </div>
              )}
            </div>

            {/* Quick Canvas Actions Bar (Visible when on Flow tab) */}
            {activeEditorTab === 'flow' ? (
              <div className="flex items-center gap-2 text-xs shrink-0">
                {/* Undo / Redo Controls */}
                <div className="flex items-center bg-[var(--vscode-button-secondary)] rounded-lg border border-[var(--vscode-border)] overflow-hidden shadow-xs">
                  <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo diagram change (Ctrl+Z / ⌘Z)"
                    className={`flex items-center gap-1 px-2 py-1.5 transition-colors cursor-pointer ${
                      canUndo
                        ? 'hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-primary)]'
                        : 'opacity-35 text-[var(--vscode-text-muted)] cursor-not-allowed'
                    }`}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline text-[11px] font-medium">Undo</span>
                  </button>
                  <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo diagram change (Ctrl+Y / ⌘⇧Z)"
                    className={`flex items-center gap-1 px-2 py-1.5 transition-colors cursor-pointer border-l border-[var(--vscode-border)] ${
                      canRedo
                        ? 'hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-primary)]'
                        : 'opacity-35 text-[var(--vscode-text-muted)] cursor-not-allowed'
                    }`}
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline text-[11px] font-medium">Redo</span>
                  </button>
                </div>

                {/* Auto Layout button */}
                <button
                  onClick={() => onAutoLayout('TB')}
                  title="Auto-arrange graph layout (Dagre algorithm)"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--vscode-button-secondary)] hover:bg-[var(--vscode-hover)] border border-[var(--vscode-border)] text-[var(--vscode-text-primary)] transition-colors cursor-pointer text-xs font-semibold shadow-xs"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-blue-500" />
                  <span className="hidden sm:inline">Auto-Layout</span>
                </button>

                {/* Zoom Controls */}
                <div className="flex items-center bg-[var(--vscode-button-secondary)] rounded-lg border border-[var(--vscode-border)] overflow-hidden shadow-xs">
                  <button
                    onClick={onZoomIn}
                    title="Zoom In"
                    className="p-1.5 hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)] cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onZoomOut}
                    title="Zoom Out"
                    className="p-1.5 hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)] cursor-pointer border-l border-r border-[var(--vscode-border)]"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onFitView}
                    title="Fit View"
                    className="p-1.5 hover:bg-[var(--vscode-hover)] text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)] cursor-pointer"
                  >
                    <Maximize className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[var(--vscode-text-muted)]">
                <span className="font-mono text-[11px]">User Settings</span>
              </div>
            )}
          </div>

          {/* Children: Top 2/3 Diagram + Bottom 1/3 Tab View */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {children}
          </div>
        </div>
      </div>

      {/* VS Code Bottom Status Bar */}
      <div className="h-6 bg-[var(--vscode-status-bar)] border-t border-[var(--vscode-border)] text-[var(--vscode-text-primary)] flex items-center justify-between px-3 text-[11px] font-medium shrink-0 select-none transition-colors">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-blue-400 dark:text-blue-300">
            <GitFork className="w-3 h-3" />
            <span>main*</span>
          </div>
          <div className="flex items-center gap-1 text-emerald-400 dark:text-emerald-300">
            <CheckCircle className="w-3 h-3" />
            <span>{activeFileName} ({activeAgentsCount} Agents, {connectionsCount} Links)</span>
          </div>
          <span className="hidden sm:inline opacity-75">React Flow v12</span>
        </div>

        <div className="flex items-center gap-3 opacity-80">
          <span className="hidden md:inline">Google ADK & LangGraph Dual Engine</span>
          <span className="font-mono">UTF-8</span>
          <span className="font-mono">TypeScript / Python</span>
          <Bell className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
};
