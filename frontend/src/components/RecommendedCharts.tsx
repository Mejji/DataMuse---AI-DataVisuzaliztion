import { useState } from 'react';
import { PlusCircle, Check } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import { useDataStore } from '../stores/useDataStore';
import type { RecommendedChart } from '../lib/api';

interface RecommendedChartsProps {
  charts: RecommendedChart[];
}

export function RecommendedCharts({ charts }: RecommendedChartsProps) {
  const { addPanel } = useDataStore();
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  const handleAdd = (chart: RecommendedChart, index: number) => {
    addPanel(chart.chart_config, 'suggestion');
    setAddedIds((prev) => new Set(prev).add(index));
  };

  return (
    <div className="space-y-3 max-w-[95%]">
      <p className="text-xs font-display font-semibold text-muted-foreground">
        Recommended visualizations
      </p>
      <div className="grid grid-cols-1 gap-3">
        {charts.map((chart, i) => {
          const isAdded = addedIds.has(i);
          return (
            <div
              key={i}
              className="group bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-4
                         hover:border-dm-coral/30 hover:shadow-md transition-all duration-200 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-display font-bold text-foreground text-sm leading-tight line-clamp-1">
                    {chart.title}
                  </h4>
                  {chart.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {chart.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleAdd(chart, i)}
                  disabled={isAdded}
                  className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg
                             transition-all duration-200 ${
                               isAdded
                                 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600'
                                 : 'bg-dm-coral-light dark:bg-dm-coral/10 text-dm-coral hover:bg-dm-coral/20 hover:scale-105'
                             }`}
                >
                  {isAdded ? (
                    <>
                      <Check className="w-3 h-3" />
                      Added
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-3 h-3" />
                      Add
                    </>
                  )}
                </button>
              </div>
              <div className="pointer-events-none rounded-xl overflow-hidden bg-muted/30 p-1.5">
                <ChartRenderer config={chart.chart_config} height={120} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
