import { useState, useEffect, useRef } from 'react';
import { X, Pin, Maximize2, Minimize2 } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { ChartConfig } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface DashboardPanelProps {
  id: string;
  chart: ChartConfig;
  source: 'suggestion' | 'chat' | 'manual';
  isHighlighted: boolean;
}

export function DashboardPanel({ id, chart, source, isHighlighted }: DashboardPanelProps) {
  const { removePanel, pinInsight, highlightPanel } = useDataStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHighlighted && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const timer = setTimeout(() => highlightPanel(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted, highlightPanel]);

  const sourceLabel = source === 'chat' ? 'From conversation' : source === 'suggestion' ? 'Suggested by Muse' : '';
  const sourceColor = source === 'chat' ? 'text-dm-teal bg-dm-teal-light' : 'text-dm-coral bg-dm-coral-light';

  return (
    <div
      ref={panelRef}
      className={`
        bg-white border rounded-2xl p-6 transition-all duration-500 group
        hover:-translate-y-0.5
        ${isHighlighted
          ? 'border-dm-coral/40 shadow-xl shadow-dm-coral/10 ring-2 ring-dm-coral/20'
          : 'border-border/60 shadow-sm hover:shadow-lg hover:shadow-dm-coral/5 hover:border-border'
        }
        ${isExpanded ? 'col-span-full' : ''}
      `}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <h3 className="font-display font-bold text-dm-slate text-sm">{chart.title}</h3>
          {sourceLabel && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${sourceColor}`}>
              {sourceLabel}
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => pinInsight(chart.title || 'Chart insight')}
            className="p-1.5 text-muted-foreground hover:text-dm-violet hover:bg-violet-50 rounded-lg transition-all duration-200"
            title="Pin to story"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-muted-foreground hover:text-dm-teal hover:bg-dm-teal-light rounded-lg transition-all duration-200"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => removePanel(id)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all duration-200"
            title="Remove from dashboard"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive chart */}
      <ChartRenderer config={chart} height={isExpanded ? 500 : 320} />
    </div>
  );
}
