import { useState } from 'react';
import { ArrowLeft, Loader2, Sparkles, BookOpen, Download } from 'lucide-react';
import { StoryChapterCard } from './StoryChapter';
import { generateStory } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';
import type { StoryChapter } from '../lib/api';
import { exportDashboardAsPDF } from '../lib/exportUtils';

export function StoryBuilder() {
  const {
    datasetId, story, setStory, setStoryMode, pinnedInsights,
  } = useDataStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyTitle, setStoryTitle] = useState(story?.title || '');

  const handleGenerate = async () => {
    if (!datasetId) return;
    setIsGenerating(true);
    try {
      const result = await generateStory(datasetId, pinnedInsights);
      setStory(result);
      setStoryTitle(result.title);
    } catch {
      alert('Failed to generate story. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateChapter = (index: number, updated: StoryChapter) => {
    if (!story) return;
    const chapters = [...story.chapters];
    chapters[index] = updated;
    setStory({ ...story, chapters });
  };

  const deleteChapter = (index: number) => {
    if (!story) return;
    const chapters = story.chapters.filter((_, i) => i !== index);
    setStory({ ...story, chapters });
  };

  return (
    <main className="flex-1 overflow-auto bg-mesh-warm">
      {/* Header */}
      <div className="sticky top-0 bg-card/80 backdrop-blur-md border-b border-border/60 px-4 md:px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStoryMode(false)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-dm-violet" />
            <h1 className="text-lg font-display font-bold text-foreground">Story Builder</h1>
          </div>
        </div>

        <div className="flex gap-2">
          {story && !isGenerating && (
            <button
              onClick={() => exportDashboardAsPDF('story-container')}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-card border border-border/60 text-foreground rounded-xl
                         hover:bg-accent hover:border-border text-sm font-display font-semibold transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 md:px-5 py-2.5 bg-gradient-to-r from-dm-coral to-dm-amber text-white rounded-xl
                       hover:shadow-lg hover:shadow-dm-coral/20 disabled:from-muted disabled:to-muted disabled:text-muted-foreground
                       disabled:shadow-none text-sm font-display font-semibold transition-all duration-200"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{story ? 'Regenerate' : 'Generate Story'}</span>
            <span className="sm:hidden">{story ? 'Redo' : 'Generate'}</span>
          </button>
        </div>
      </div>

      {/* Story content */}
      <div id="story-container" className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        {!story && !isGenerating && (
          <div className="text-center py-20 animate-fade-up">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-dm-violet/10 to-dm-sky/10 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-dm-violet/40" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-3">
              Ready to tell your data's story?
            </h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
              Muse will draft a narrative based on what we've found in your data.
              You can edit every part — titles, text, even swap the charts.
            </p>
            {pinnedInsights.length > 0 && (
              <p className="text-xs font-medium text-dm-violet bg-violet-50 dark:bg-dm-violet/10 inline-block px-3 py-1.5 rounded-full mb-6">
                {pinnedInsights.length} pinned insight{pinnedInsights.length > 1 ? 's' : ''} will be included
              </p>
            )}
            <div>
              <button
                onClick={handleGenerate}
                className="px-8 py-3.5 bg-gradient-to-r from-dm-coral to-dm-amber text-white rounded-2xl
                           hover:shadow-lg hover:shadow-dm-coral/20 font-display font-bold
                           transition-all duration-200 hover:scale-105"
              >
                Let Muse draft your story
              </button>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-20 animate-fade-in">
            <div className="relative inline-block mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-dm-coral to-dm-amber flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-dm-coral to-dm-amber animate-ping opacity-20" />
            </div>
            <p className="text-foreground font-display font-semibold">Muse is crafting your data story...</p>
            <p className="text-xs text-muted-foreground mt-2">This usually takes 10–20 seconds</p>
          </div>
        )}

        {story && !isGenerating && (
          <div className="space-y-8 animate-fade-up">
            {/* Story title */}
            <input
              value={storyTitle}
              onChange={(e) => {
                setStoryTitle(e.target.value);
                setStory({ ...story, title: e.target.value });
              }}
              className="w-full text-2xl md:text-3xl font-display font-extrabold text-foreground bg-transparent border-none
                         focus:outline-none focus:ring-0 placeholder-muted-foreground/30 tracking-tight"
              placeholder="Your story title..."
            />

            {/* Chapters */}
            <div className="space-y-6 stagger-children">
              {story.chapters
                .sort((a, b) => a.order - b.order)
                .map((chapter, i) => (
                  <StoryChapterCard
                    key={i}
                    chapter={chapter}
                    onUpdate={(updated) => updateChapter(i, updated)}
                    onDelete={() => deleteChapter(i)}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
