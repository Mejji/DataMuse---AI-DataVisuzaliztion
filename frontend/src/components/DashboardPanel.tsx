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

  // Auto-scroll to highlighted panel
  useEffect(() => {
    if (isHighlighted && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Remove highlight after animation
      const timer = setTimeout(() => highlightPanel(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted, highlightPanel]);

  const sourceLabel = source === 'chat' ? 'From conversation' : source === 'suggestion' ? 'Suggested by Muse' : '';

  return (
    <div
      ref={panelRef}
      className={`
        bg-white border rounded-2xl p-5 transition-all duration-500
        ${isHighlighted
          ? 'border-indigo-400 shadow-lg shadow-indigo-100 ring-2 ring-indigo-200'
          : 'border-stone-200 shadow-sm hover:shadow-md'
        }
        ${isExpanded ? 'col-span-full' : ''}
      `}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-stone-800 text-sm">{chart.title}</h3>
          {sourceLabel && (
            <span className="text-xs text-stone-400">{sourceLabel}</span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => pinInsight(chart.title || 'Chart insight')}
            className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Pin to story"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => removePanel(id)}
            className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
