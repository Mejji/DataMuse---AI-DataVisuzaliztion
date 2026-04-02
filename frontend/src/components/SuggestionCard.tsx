import { ChartRenderer } from './ChartRenderer';
import type { VisualizationSuggestion } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface SuggestionCardProps {
  suggestion: VisualizationSuggestion;
}

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const { addPanel } = useDataStore();

  return (
    <button
      onClick={() => addPanel(suggestion.chart_config, 'suggestion')}
      className="bg-white border border-stone-200 rounded-xl p-4 text-left hover:border-indigo-300
                 hover:shadow-md transition-all group w-full"
    >
      <h4 className="font-medium text-stone-800 text-sm group-hover:text-indigo-700 mb-1">
        {suggestion.title}
      </h4>
      <p className="text-xs text-stone-400 mb-3 line-clamp-2">{suggestion.description}</p>
      <div className="pointer-events-none">
        <ChartRenderer config={suggestion.chart_config} height={160} />
      </div>
    </button>
  );
}
