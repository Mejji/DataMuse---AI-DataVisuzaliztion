import { create } from 'zustand';
import type { DatasetProfile, ChatMessage, VisualizationSuggestion, ChartConfig, Story } from '../lib/api';

// A panel on the interactive dashboard
interface DashboardPanel {
  id: string;
  chart: ChartConfig;
  source: 'suggestion' | 'chat' | 'manual';  // Where it came from
  timestamp: string;
}

interface DataState {
  // Dataset
  datasetId: string | null;
  profile: DatasetProfile | null;
  isUploading: boolean;
  isAnalyzing: boolean;

  // Chat
  messages: ChatMessage[];
  isChatLoading: boolean;
  suggestedPrompts: string[];

  // Interactive Dashboard — accumulating multi-panel
  dashboardPanels: DashboardPanel[];
  highlightedPanelId: string | null;  // Which panel to scroll to / highlight
  suggestions: VisualizationSuggestion[];
  pinnedInsights: string[];

  // Story
  story: Story | null;
  isStoryMode: boolean;

  // View
  view: 'upload' | 'explore' | 'story';

  // Actions
  setDataset: (id: string, profile: DatasetProfile) => void;
  setUploading: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  setChatLoading: (v: boolean) => void;
  setSuggestedPrompts: (prompts: string[]) => void;

  // Dashboard panel actions
  addPanel: (chart: ChartConfig, source: DashboardPanel['source']) => void;
  removePanel: (id: string) => void;
  clearPanels: () => void;
  highlightPanel: (id: string | null) => void;

  setSuggestions: (s: VisualizationSuggestion[]) => void;
  pinInsight: (insight: string) => void;
  setStory: (story: Story | null) => void;
  setStoryMode: (v: boolean) => void;
  setView: (view: 'upload' | 'explore' | 'story') => void;
  reset: () => void;
}

let panelCounter = 0;

export const useDataStore = create<DataState>((set) => ({
  datasetId: null,
  profile: null,
  isUploading: false,
  isAnalyzing: false,
  messages: [],
  isChatLoading: false,
  suggestedPrompts: [],
  dashboardPanels: [],
  highlightedPanelId: null,
  suggestions: [],
  pinnedInsights: [],
  story: null,
  isStoryMode: false,
  view: 'upload',

  setDataset: (id, profile) => set({ datasetId: id, profile, view: 'explore' }),
  setUploading: (v) => set({ isUploading: v }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setChatLoading: (v) => set({ isChatLoading: v }),
  setSuggestedPrompts: (prompts) => set({ suggestedPrompts: prompts }),

  // Dashboard panel management
  addPanel: (chart, source) => {
    const id = `panel-${++panelCounter}`;
    set((s) => ({
      dashboardPanels: [...s.dashboardPanels, {
        id,
        chart,
        source,
        timestamp: new Date().toISOString(),
      }],
      highlightedPanelId: id,  // Auto-highlight newest panel
    }));
  },
  removePanel: (id) => set((s) => ({
    dashboardPanels: s.dashboardPanels.filter((p) => p.id !== id),
    highlightedPanelId: s.highlightedPanelId === id ? null : s.highlightedPanelId,
  })),
  clearPanels: () => set({ dashboardPanels: [], highlightedPanelId: null }),
  highlightPanel: (id) => set({ highlightedPanelId: id }),

  setSuggestions: (suggestions) => set({ suggestions }),
  pinInsight: (insight) => set((s) => ({ pinnedInsights: [...s.pinnedInsights, insight] })),
  setStory: (story) => set({ story }),
  setStoryMode: (v) => set({ isStoryMode: v, view: v ? 'story' : 'explore' }),
  setView: (view) => set({ view }),
  reset: () => set({
    datasetId: null, profile: null, isUploading: false, isAnalyzing: false, messages: [], isChatLoading: false, suggestedPrompts: [], dashboardPanels: [],
    highlightedPanelId: null,
    suggestions: [], pinnedInsights: [], story: null, isStoryMode: false, view: 'upload',
  }),
}));
