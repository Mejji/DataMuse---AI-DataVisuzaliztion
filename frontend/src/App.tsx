import { UploadZone } from './components/UploadZone';
import { InteractiveDashboard } from './components/InteractiveDashboard';
import { CompanionPanel } from './components/CompanionPanel';
import { StoryBuilder } from './components/StoryBuilder';
import { useDataStore } from './stores/useDataStore';
import { RotateCcw } from 'lucide-react';

function App() {
  const { view, reset, profile } = useDataStore();

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      {/* Top bar */}
      <header className="h-14 border-b border-stone-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <h1 className="text-lg font-semibold text-stone-800 tracking-tight">DataMuse</h1>
        </div>

        {profile && (
          <button
            onClick={reset}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg hover:bg-stone-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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
