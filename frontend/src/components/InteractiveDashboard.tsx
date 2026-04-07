import { DashboardPanel } from './DashboardPanel';
import { SuggestionCard } from './SuggestionCard';
import { useDataStore } from '../stores/useDataStore';
import { LayoutGrid, Trash2, Sparkles, Loader2, Download, Lightbulb, Undo2, FileDown } from 'lucide-react';
import { exportDashboardAsPDF } from '../lib/exportUtils';

export function InteractiveDashboard() {
  const { dashboardPanels, highlightedPanelId, suggestions, profile, clearPanels, isAnalyzing, datasetId, sendChatMessage, isChatLoading, canUndo, undoMutation, downloadData } = useDataStore();

  return (
    <main className="flex-1 p-4 md:p-6 overflow-auto bg-mesh-warm">
      {/* Dataset overview badge */}
      {profile && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border/60 text-foreground text-sm font-display font-semibold px-4 py-2 rounded-xl shadow-sm">
              <div className="w-2 h-2 rounded-full bg-dm-teal animate-pulse-soft" />
              {profile.filename}
            </div>
            <span className="hidden sm:inline-block text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {profile.row_count.toLocaleString()} rows · {profile.column_count} columns
            </span>
          </div>
          {dashboardPanels.length > 0 && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-card px-3 py-1.5 rounded-lg border border-border/40">
                <LayoutGrid className="w-3.5 h-3.5 text-dm-coral/60" />
                {dashboardPanels.length} panel{dashboardPanels.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => exportDashboardAsPDF('dashboard-grid')}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5
                           px-3 py-1.5 rounded-lg hover:bg-accent transition-all duration-200"
              >
                <Download className="w-3 h-3" />
                Export PDF
              </button>
              <button
                onClick={() => downloadData()}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5
                           px-3 py-1.5 rounded-lg hover:bg-accent transition-all duration-200"
              >
                <FileDown className="w-3 h-3" />
                Download CSV
              </button>
              {canUndo && (
                <button
                  onClick={() => undoMutation()}
                  className="text-xs text-dm-amber hover:text-dm-amber/80 flex items-center gap-1.5
                             px-3 py-1.5 rounded-lg hover:bg-dm-amber/5 transition-all duration-200"
                >
                  <Undo2 className="w-3 h-3" />
                  Undo
                </button>
              )}
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
        <div id="dashboard-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10 stagger-children">
          {dashboardPanels.map((panel) => (
            <DashboardPanel
              key={panel.id}
              id={panel.id}
              chart={panel.chart}
              table={panel.table}
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
            <h3 className="text-sm font-display font-bold text-foreground">
              Muse's suggestions
            </h3>
            <span className="text-xs text-muted-foreground">· click to add to dashboard</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Persistent "Recommended Visualizations" card */}
      {datasetId && (
        <div className="mt-6 animate-fade-up" style={{ animationDelay: '300ms' }}>
          <button
            onClick={() => sendChatMessage("Show me recommended visualizations for this dataset")}
            disabled={isChatLoading}
            className="group w-full max-w-sm mx-auto flex items-center gap-4 bg-gradient-to-r from-dm-violet/5 via-dm-coral/5 to-dm-amber/5
                       hover:from-dm-violet/10 hover:via-dm-coral/10 hover:to-dm-amber/10
                       border border-dm-coral/20 hover:border-dm-coral/40 rounded-2xl px-5 py-4
                       transition-all duration-300 hover:shadow-lg hover:shadow-dm-coral/5 hover:-translate-y-0.5
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-dm-coral via-dm-amber to-dm-teal
                            flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
              <Lightbulb className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h4 className="font-display font-bold text-sm text-foreground group-hover:text-dm-coral transition-colors duration-200">
                Recommended Visualizations
              </h4>
              <p className="text-xs text-muted-foreground">
                Ask Muse for chart suggestions tailored to your data
              </p>
            </div>
            <Sparkles className="w-4 h-4 text-dm-amber/40 group-hover:text-dm-amber ml-auto flex-shrink-0
                                 transition-colors duration-200" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {dashboardPanels.length === 0 && suggestions.length === 0 && !isAnalyzing && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-dm-coral/5 to-dm-amber/5 flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-dm-coral/30" />
          </div>
          <p className="text-sm font-display font-semibold text-foreground/60">Your dashboard will build up as you explore</p>
          <p className="text-xs text-muted-foreground/60">Ask Muse a question or click a suggestion to get started</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isAnalyzing && dashboardPanels.length === 0 && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-8 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card/40 border border-border/40 rounded-2xl p-6 h-64 flex flex-col gap-4 animate-skeleton">
                <div className="h-6 bg-muted rounded-md w-1/3 animate-shimmer" />
                <div className="flex-1 bg-muted rounded-xl animate-shimmer" />
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-dm-coral" />
              <p className="text-sm font-display font-semibold">Muse is analyzing your data...</p>
            </div>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-dm-coral/40 animate-pulse-soft" />
              <span className="w-2 h-2 rounded-full bg-dm-amber/40 animate-pulse-soft" style={{ animationDelay: '200ms' }} />
              <span className="w-2 h-2 rounded-full bg-dm-teal/40 animate-pulse-soft" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
