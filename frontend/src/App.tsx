import { UploadZone } from './components/UploadZone';
import { InteractiveDashboard } from './components/InteractiveDashboard';
import { CompanionPanel } from './components/CompanionPanel';
import { StoryBuilder } from './components/StoryBuilder';
import { useDataStore } from './stores/useDataStore';
import { RotateCcw, Sparkles, Sun, Moon, MessageSquare, X, ShieldAlert } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useState, useEffect } from 'react';

const PRIVACY_DISMISSED_KEY = 'datamuse-privacy-dismissed';

function App() {
  const { view, reset, profile, isChatPanelOpen, setIsChatPanelOpen } = useDataStore();
  const { theme, toggleTheme } = useTheme();
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(PRIVACY_DISMISSED_KEY)) {
      setShowPrivacy(true);
    }
  }, []);

  const dismissPrivacy = () => {
    setShowPrivacy(false);
    localStorage.setItem(PRIVACY_DISMISSED_KEY, '1');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Privacy disclosure banner */}
      {showPrivacy && (
        <div className="bg-dm-amber/10 border-b border-dm-amber/20 px-4 py-2.5 flex items-start sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <ShieldAlert className="w-4 h-4 text-dm-amber flex-shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              <span className="font-semibold">Privacy:</span> Your data is sent to third-party AI providers (Groq, Cerebras, Google) for analysis.
              Avoid uploading sensitive data. For full privacy, use{' '}
              <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-dm-teal font-medium hover:underline underline-offset-2">
                local models via Ollama
              </a>.
            </p>
          </div>
          <button
            onClick={dismissPrivacy}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 p-0.5"
            aria-label="Dismiss privacy notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Top bar */}
      <header className="h-16 border-b border-border/60 bg-card/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* Logo mark — warm gradient orb */}
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-dm-coral via-dm-amber to-dm-teal opacity-90" />
            <div className="relative w-full h-full rounded-xl flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-xl font-display font-bold tracking-tight text-foreground">
              DataMuse
            </h1>
            {profile && (
              <span className="hidden sm:inline-block text-xs font-medium text-dm-coral/80 bg-dm-coral-light dark:bg-dm-coral/10 px-2 py-0.5 rounded-full ml-2 animate-fade-in">
                {profile.filename}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>

          {profile && (
            <>
              <button
                onClick={reset}
                className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground
                           px-3 py-2 rounded-xl hover:bg-accent transition-all duration-200 group"
              >
                <RotateCcw className="w-3.5 h-3.5 group-hover:rotate-[-90deg] transition-transform duration-300" />
                New Dataset
              </button>
              
              {/* Mobile reset icon only */}
              <button
                onClick={reset}
                className="sm:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="New Dataset"
              >
                <RotateCcw className="w-4.5 h-4.5" />
              </button>

              {/* Mobile chat toggle */}
              {view !== 'upload' && (
                <button
                  onClick={() => setIsChatPanelOpen(!isChatPanelOpen)}
                  className="md:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative"
                  aria-label="Toggle chat"
                >
                  {isChatPanelOpen ? <X className="w-4.5 h-4.5" /> : <MessageSquare className="w-4.5 h-4.5" />}
                  {!isChatPanelOpen && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-dm-coral rounded-full border-2 border-card"></span>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === 'upload' && <UploadZone />}
          {view === 'explore' && <InteractiveDashboard />}
          {view === 'story' && <StoryBuilder />}
        </div>

        {/* Companion panel (always visible except on upload) */}
        {view !== 'upload' && (
          <div className={`
            absolute inset-y-0 right-0 z-40 transform transition-transform duration-300 ease-in-out
            md:relative md:transform-none
            ${isChatPanelOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          `}>
            <CompanionPanel />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
