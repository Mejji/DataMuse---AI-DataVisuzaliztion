import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

// ---------------------------------------------------------------------------
// Lightweight in-memory cache with TTL + request deduplication
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function invalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Deduplicated + cached async fetch. Identical in-flight requests share one promise. */
async function cachedFetch<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== undefined) return hit;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fn().then((result) => {
    setCached(key, result, ttlMs);
    inflight.delete(key);
    return result;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

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

export interface ChartCustomizeOptions {
  // Universal
  height?: number;
  colors?: string[];  // palette override
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  margins?: { top?: number; right?: number; bottom?: number; left?: number };

  // Per-series color overrides (dataKey -> hex color)
  seriesColors?: Record<string, string>;

  // Line/Area specific
  strokeWidth?: number;
  dotSize?: number;
  areaOpacity?: number;

  // Bar specific
  barRadius?: number;

  // Pie/Donut specific
  innerRadius?: number;   // percentage 0-100
  outerRadius?: number;   // percentage 0-100
  paddingAngle?: number;

  // Histogram specific
  binCount?: number;

  // Radar specific
  radarOpacity?: number;
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

export interface StoryAngle {
  id: string;
  label: string;
  description: string;
  prompt_hint: string;
}

export interface RefineResult {
  title: string;
  narrative: string;
  suggestions: string[];
}

export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/upload', formData);
  return data as { dataset_id: string; profile: DatasetProfile; chunks_embedded: number };
};

/** @deprecated Use uploadFile instead */
export const uploadCSV = uploadFile;

export const sendMessage = async (message: string, datasetId: string) => {
  const { data } = await api.post('/chat', { message, dataset_id: datasetId });
  return data as ChatMessage;
};

export const getAnalysis = async (datasetId: string) => {
  return cachedFetch(
    `analysis:${datasetId}`,
    5 * 60 * 1000, // 5 min TTL
    async () => {
      const { data } = await api.get(`/analyze/${datasetId}`);
      return data as { dataset_id: string; suggestions: VisualizationSuggestion[] };
    },
  );
};

export const generateStory = async (datasetId: string, pinnedInsights: string[] = [], angle: string = '', customPrompt: string = '') => {
  const { data } = await api.post('/story/generate', {
    dataset_id: datasetId,
    pinned_insights: pinnedInsights,
    angle,
    custom_prompt: customPrompt,
  });
  return data as Story;
};

export const getStoryAngles = async () => {
  return cachedFetch(
    'storyAngles',
    10 * 60 * 1000, // 10 min TTL — static data
    async () => {
      const { data } = await api.get('/story/angles');
      return data as { angles: StoryAngle[] };
    },
  );
};

export const refineChapter = async (
  datasetId: string,
  chapterTitle: string,
  chapterNarrative: string,
  userInstruction: string,
) => {
  const { data } = await api.post('/story/refine', {
    dataset_id: datasetId,
    chapter_title: chapterTitle,
    chapter_narrative: chapterNarrative,
    user_instruction: userInstruction,
  });
  return data as RefineResult;
};

export const applyMutation = async (datasetId: string, previewId: string) => {
  const { data } = await api.post('/data/apply', { dataset_id: datasetId, preview_id: previewId });
  // Dataset changed — invalidate stale caches
  invalidatePrefix(`analysis:${datasetId}`);
  invalidatePrefix(`mutationHistory:${datasetId}`);
  return data as { success: boolean; description: string; profile: DatasetProfile; rows: number; columns: number; can_undo: boolean; mutation_count: number };
};

export const undoMutation = async (datasetId: string) => {
  const { data } = await api.post('/data/undo', { dataset_id: datasetId });
  // Dataset reverted — invalidate stale caches
  invalidatePrefix(`analysis:${datasetId}`);
  invalidatePrefix(`mutationHistory:${datasetId}`);
  return data as { success: boolean; description: string; profile: DatasetProfile; rows: number; columns: number; can_undo: boolean; mutation_count: number };
};

export const downloadCSV = (datasetId: string) => {
  window.open(`/api/data/download/${datasetId}`, '_blank');
};

export const getMutationHistory = async (datasetId: string) => {
  return cachedFetch(
    `mutationHistory:${datasetId}`,
    30 * 1000, // 30s TTL — changes on mutations
    async () => {
      const { data } = await api.get(`/data/history/${datasetId}`);
      return data as { mutation_log: string[]; can_undo: boolean; undo_depth: number };
    },
  );
};
