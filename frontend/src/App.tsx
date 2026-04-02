import { UploadZone } from './components/UploadZone';
import { InteractiveDashboard } from './components/InteractiveDashboard';
import { CompanionPanel } from './components/CompanionPanel';
import { StoryBuilder } from './components/StoryBuilder';
import { useDataStore } from './stores/useDataStore';
import { RotateCcw, Sparkles } from 'lucide-react';

function App() {
  const { view, reset, profile } = useDataStore();

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-16 border-b border-border/60 bg-white/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* Logo mark — warm gradient orb */}
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-dm-coral via-dm-amber to-dm-teal opacity-90" />
            <div className="relative w-full h-full rounded-xl flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-xl font-display font-bold tracking-tight text-dm-slate">
              DataMuse
            </h1>
            {profile && (
              <span className="text-xs font-medium text-dm-coral/80 bg-dm-coral-light px-2 py-0.5 rounded-full ml-2 animate-fade-in">
                {profile.filename}
              </span>
            )}
          </div>
        </div>

        {profile && (
          <button
            onClick={reset}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground
                       px-3 py-2 rounded-xl hover:bg-accent transition-all duration-200 group"
          >
            <RotateCcw className="w-3.5 h-3.5 group-hover:rotate-[-90deg] transition-transform duration-300" />
            New dataset
          </button>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {view === 'upload' && <UploadZone />}
        {view === 'explore' && <InteractiveDashboard />}
        {view === 'story' && <StoryBuilder />}

        {/* Companion panel (always visible except on upload) */}
        {view !== 'upload' && <CompanionPanel />}
      </div>
    </div>
  );
}

export default App;
