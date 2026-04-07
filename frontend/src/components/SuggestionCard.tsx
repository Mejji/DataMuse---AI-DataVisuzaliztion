import { ChartRenderer } from './ChartRenderer';
import type { VisualizationSuggestion } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';
import { PlusCircle } from 'lucide-react';

interface SuggestionCardProps {
  suggestion: VisualizationSuggestion;
}

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const { addPanel } = useDataStore();

  return (
    <button
      onClick={() => addPanel(suggestion.chart_config, 'suggestion')}
      className="group relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-3 sm:p-4 md:p-5 text-left
                 hover:bg-card hover:border-dm-coral/30 hover:shadow-lg hover:shadow-dm-coral/5
                 hover:-translate-y-1 transition-all duration-300 w-full overflow-hidden"
    >
      {/* Hover gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-dm-coral via-dm-amber to-dm-teal
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl" />

      <div className="flex items-start justify-between mb-2">
        <h4 className="font-display font-bold text-foreground text-sm group-hover:text-dm-coral transition-colors duration-200 flex-1 pr-2 line-clamp-2">
          {suggestion.title}
        </h4>
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-dm-coral-light dark:bg-dm-coral/10 flex items-center justify-center
                        opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:scale-100 scale-90">
          <PlusCircle className="w-4 h-4 text-dm-coral" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{suggestion.description}</p>
      <div className="pointer-events-none rounded-xl overflow-hidden bg-muted/30 p-2">
        <ChartRenderer config={suggestion.chart_config} height={120} />
      </div>
    </button>
  );
}
