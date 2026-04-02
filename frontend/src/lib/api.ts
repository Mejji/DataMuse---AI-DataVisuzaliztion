import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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

export interface ChartConfig {
  chart_type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'composed';
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

export interface ChatMessage {
  role: 'user' | 'muse';
  content: string;
  chart_config?: ChartConfig | null;
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
