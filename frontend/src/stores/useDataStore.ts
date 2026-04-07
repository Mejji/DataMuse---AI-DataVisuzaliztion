import { create } from 'zustand';
import type { DatasetProfile, ChatMessage, VisualizationSuggestion, ChartConfig, TableConfig, Story } from '../lib/api';
import { sendMessage, applyMutation as applyMutationApi, undoMutation as undoMutationApi, downloadCSV } from '../lib/api';

// A panel on the interactive dashboard
interface DashboardPanel {
  id: string;
  chart?: ChartConfig;
  table?: TableConfig;
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

  // Mutations
  mutationHistory: string[];
  canUndo: boolean;

  // View
  view: 'upload' | 'explore' | 'story';
  isChatPanelOpen: boolean;

  // Actions
  setDataset: (id: string, profile: DatasetProfile) => void;
  setUploading: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  setChatLoading: (v: boolean) => void;
  setSuggestedPrompts: (prompts: string[]) => void;

  // Dashboard panel actions
  addPanel: (chart: ChartConfig | undefined, source: DashboardPanel['source'], table?: TableConfig) => void;
  removePanel: (id: string) => void;
  clearPanels: () => void;
  highlightPanel: (id: string | null) => void;

  setSuggestions: (s: VisualizationSuggestion[]) => void;
  pinInsight: (insight: string) => void;
  setStory: (story: Story | null) => void;
  setStoryMode: (v: boolean) => void;
  setView: (view: 'upload' | 'explore' | 'story') => void;
  setIsChatPanelOpen: (v: boolean) => void;
  sendChatMessage: (message: string) => Promise<void>;
  
  // Mutation actions
  applyMutation: (previewId: string) => Promise<boolean>;
  undoMutation: () => Promise<boolean>;
  downloadData: () => void;
  
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
  mutationHistory: [],
  canUndo: false,
  view: 'upload',
  isChatPanelOpen: false,

  setDataset: (id, profile) => set({ datasetId: id, profile, view: 'explore' }),
  setUploading: (v) => set({ isUploading: v }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setChatLoading: (v) => set({ isChatLoading: v }),
  setSuggestedPrompts: (prompts) => set({ suggestedPrompts: prompts }),

  // Dashboard panel management
  addPanel: (chart, source, table) => {
    const id = `panel-${++panelCounter}`;
    set((s) => ({
      dashboardPanels: [...s.dashboardPanels, {
        id,
        ...(chart && { chart }),
        ...(table && { table }),
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
  setIsChatPanelOpen: (v) => set({ isChatPanelOpen: v }),
  sendChatMessage: async (message) => {
    const state = useDataStore.getState();
    if (!state.datasetId || state.isChatLoading) return;

    // Add user message
    set((s) => ({
      messages: [...s.messages, {
        role: 'user' as const,
        content: message,
        timestamp: new Date().toISOString(),
      }],
      isChatLoading: true,
      isChatPanelOpen: true,
    }));

    try {
      const response = await sendMessage(message, state.datasetId);
      set((s) => ({ messages: [...s.messages, response] }));

      if (response.chart_config && !response.recommended_charts?.length && !response.mutation_preview) {
        useDataStore.getState().addPanel(response.chart_config, 'chat');
      }
      
      // Auto-add table to dashboard
      if (response.table_config && !response.chart_config) {
        useDataStore.getState().addPanel(undefined, 'chat', response.table_config);
      }
    } catch {
      set((s) => ({
        messages: [...s.messages, {
          role: 'muse' as const,
          content: "Sorry, I hit a snag trying to answer that. Could you try rephrasing?",
          timestamp: new Date().toISOString(),
        }],
      }));
    } finally {
      set({ isChatLoading: false });
    }
  },
  applyMutation: async (previewId: string) => {
    const state = useDataStore.getState();
    if (!state.datasetId) return false;
    try {
      const result = await applyMutationApi(state.datasetId, previewId);
      if (result.success) {
        set((s) => ({
          profile: result.profile,
          canUndo: result.can_undo,
          mutationHistory: [...s.mutationHistory, result.description],
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to apply mutation", error);
      return false;
    }
  },
  undoMutation: async () => {
    const state = useDataStore.getState();
    if (!state.datasetId) return false;
    try {
      const result = await undoMutationApi(state.datasetId);
      if (result.success) {
        set((s) => ({
          profile: result.profile,
          canUndo: result.can_undo,
          mutationHistory: s.mutationHistory.slice(0, -1),
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to undo mutation", error);
      return false;
    }
  },
  downloadData: () => {
    const state = useDataStore.getState();
    if (state.datasetId) {
      downloadCSV(state.datasetId);
    }
  },
  reset: () => set({
    datasetId: null, profile: null, isUploading: false, isAnalyzing: false, messages: [], isChatLoading: false, suggestedPrompts: [], dashboardPanels: [],
    highlightedPanelId: null,
    suggestions: [], pinnedInsights: [], story: null, isStoryMode: false, mutationHistory: [], canUndo: false, view: 'upload', isChatPanelOpen: false,
  }),
}));
