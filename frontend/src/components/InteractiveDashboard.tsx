import { DashboardPanel } from './DashboardPanel';
import { SuggestionCard } from './SuggestionCard';
import { useDataStore } from '../stores/useDataStore';
import { LayoutGrid, Trash2 } from 'lucide-react';

export function InteractiveDashboard() {
  const { dashboardPanels, highlightedPanelId, suggestions, profile, clearPanels } = useDataStore();

  return (
    <main className="flex-1 p-6 overflow-auto">
      {/* Dataset overview badge */}
      {profile && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full">
              {profile.filename}
            </div>
            <span className="text-xs text-stone-400">
              {profile.row_count.toLocaleString()} rows · {profile.column_count} columns
            </span>
          </div>
          {dashboardPanels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <LayoutGrid className="w-3.5 h-3.5" />
                {dashboardPanels.length} panel{dashboardPanels.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clearPanels}
                className="text-xs text-stone-400 hover:text-red-500 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active dashboard panels — accumulating grid */}
      {dashboardPanels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {dashboardPanels.map((panel) => (
            <DashboardPanel
              key={panel.id}
              id={panel.id}
              chart={panel.chart}
              source={panel.source}
              isHighlighted={panel.id === highlightedPanelId}
            />
          ))}
        </div>
      )}

      {/* AI Suggestions — shown below dashboard panels */}
      {suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-stone-500 mb-3">
            Muse's suggestions — click to add to your dashboard
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {dashboardPanels.length === 0 && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-2">
          <LayoutGrid className="w-10 h-10 text-stone-300" />
          <p className="text-sm">Your dashboard will build up as you explore</p>
          <p className="text-xs">Ask Muse a question or click a suggestion to get started</p>
        </div>
      )}
    </main>
  );
}
