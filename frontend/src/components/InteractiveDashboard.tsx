import { DashboardPanel } from './DashboardPanel';
import { SuggestionCard } from './SuggestionCard';
import { useDataStore } from '../stores/useDataStore';
import { LayoutGrid, Trash2, Sparkles } from 'lucide-react';

export function InteractiveDashboard() {
  const { dashboardPanels, highlightedPanelId, suggestions, profile, clearPanels } = useDataStore();

  return (
    <main className="flex-1 p-6 overflow-auto bg-mesh-warm">
      {/* Dataset overview badge */}
      {profile && (
        <div className="flex items-center justify-between mb-8 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-border/60 text-dm-slate text-sm font-display font-semibold px-4 py-2 rounded-xl shadow-sm">
              <div className="w-2 h-2 rounded-full bg-dm-teal animate-pulse-soft" />
              {profile.filename}
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {profile.row_count.toLocaleString()} rows · {profile.column_count} columns
            </span>
          </div>
          {dashboardPanels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-border/40">
                <LayoutGrid className="w-3.5 h-3.5 text-dm-coral/60" />
                {dashboardPanels.length} panel{dashboardPanels.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clearPanels}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5
                           px-3 py-1.5 rounded-lg hover:bg-destructive/5 transition-all duration-200"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10 stagger-children">
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
        <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-dm-amber" />
            <h3 className="text-sm font-display font-bold text-dm-slate">
              Muse's suggestions
            </h3>
            <span className="text-xs text-muted-foreground">· click to add to dashboard</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {dashboardPanels.length === 0 && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-dm-coral/5 to-dm-amber/5 flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-dm-coral/30" />
          </div>
          <p className="text-sm font-display font-semibold text-dm-slate/60">Your dashboard will build up as you explore</p>
          <p className="text-xs text-muted-foreground/60">Ask Muse a question or click a suggestion to get started</p>
        </div>
      )}
    </main>
  );
}
