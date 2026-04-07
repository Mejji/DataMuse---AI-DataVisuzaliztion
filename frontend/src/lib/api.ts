import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

export interface ColumnProfile {
  name: string;
  dtype: string;
  non_null_count: number;
  null_count: number;
  unique_count: number;
  sample_values: any[];
  mean?: number;
  median?: number;
  min_val?: number;
  max_val?: number;
  std?: number;
  top_values?: Record<string, number>;
}

export interface DatasetProfile {
  filename: string;
  row_count: number;
  column_count: number;
  columns: ColumnProfile[];
  sample_rows: Record<string, any>[];
  summary: string;
}

export interface TableConfig {
  table_type: string;
  title: string;
  columns: Array<{ key: string; label: string; type: string }>;
  rows: Record<string, any>[];
  row_count: number;
  total_rows: number;
}

export interface ChartConfig {
  chart_type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'composed' | 'treemap' | 'funnel' | 'radar' | 'radialBar' | 'histogram' | 'groupedBar' | 'stackedBar' | 'donut' | 'bubble' | 'waterfall' | 'boxPlot' | 'heatmap' | 'candlestick';
  title: string;
  data: any[];
  config: {
    xAxisKey: string;
    series: Array<{
      dataKey: string;
      color: string;
      type?: string;
    }>;
  };
}

export interface RecommendedChart {
  title: string;
  description: string;
  chart_config: ChartConfig;
}

export interface MutationPreview {
  preview_id: string;
  action: string;
  description: string;
  rows_before: number;
  rows_after: number;
  rows_affected: number;
  columns_affected: string[];
  sample_before: Record<string, any>[];
  sample_after: Record<string, any>[];
  details: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'muse';
  content: string;
  chart_config?: ChartConfig | null;
  table_config?: TableConfig | null;
  recommended_charts?: RecommendedChart[] | null;
  mutation_preview?: MutationPreview | null;
  timestamp?: string;
}

export interface VisualizationSuggestion {
  title: string;
  description: string;
  chart_config: ChartConfig;
}

export interface StoryChapter {
  title: string;
  narrative: string;
  chart_config?: ChartConfig;
  order: number;
}

export interface Story {
  title: string;
  chapters: StoryChapter[];
}

export const uploadCSV = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/upload', formData);
  return data as { dataset_id: string; profile: DatasetProfile; chunks_embedded: number };
};

export const sendMessage = async (message: string, datasetId: string) => {
  const { data } = await api.post('/chat', { message, dataset_id: datasetId });
  return data as ChatMessage;
};

export const getAnalysis = async (datasetId: string) => {
  const { data } = await api.get(`/analyze/${datasetId}`);
  return data as { dataset_id: string; suggestions: VisualizationSuggestion[] };
};

export const generateStory = async (datasetId: string, pinnedInsights: string[] = []) => {
  const { data } = await api.post('/story/generate', {
    dataset_id: datasetId,
    pinned_insights: pinnedInsights,
  });
  return data as Story;
};

export const applyMutation = async (datasetId: string, previewId: string) => {
  const { data } = await api.post('/data/apply', { dataset_id: datasetId, preview_id: previewId });
  return data as { success: boolean; description: string; profile: DatasetProfile; rows: number; columns: number; can_undo: boolean; mutation_count: number };
};

export const undoMutation = async (datasetId: string) => {
  const { data } = await api.post('/data/undo', { dataset_id: datasetId });
  return data as { success: boolean; description: string; profile: DatasetProfile; rows: number; columns: number; can_undo: boolean; mutation_count: number };
};

export const downloadCSV = (datasetId: string) => {
  window.open(`/api/data/download/${datasetId}`, '_blank');
};

export const getMutationHistory = async (datasetId: string) => {
  const { data } = await api.get(`/data/history/${datasetId}`);
  return data as { mutation_log: string[]; can_undo: boolean; undo_depth: number };
};
