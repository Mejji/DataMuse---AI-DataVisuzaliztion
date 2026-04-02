import { useState } from 'react';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { StoryChapterCard } from './StoryChapter';
import { generateStory } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';
import type { StoryChapter } from '../lib/api';

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
    <main className="flex-1 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-stone-50 border-b border-stone-200 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStoryMode(false)}
            className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-200 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold text-stone-800">Story Builder</h1>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                       hover:bg-indigo-700 disabled:bg-stone-300 text-sm font-medium transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {story ? 'Regenerate' : 'Generate Story'}
          </button>
        </div>
      </div>

      {/* Story content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {!story && !isGenerating && (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-stone-600 mb-2">Ready to tell your data's story?</h2>
            <p className="text-sm text-stone-400 mb-6 max-w-md mx-auto">
              Muse will draft a story based on what we've found in your data.
              You can edit every part — the titles, the text, even swap the charts.
            </p>
            {pinnedInsights.length > 0 && (
              <p className="text-xs text-indigo-600 mb-4">
                {pinnedInsights.length} pinned insight{pinnedInsights.length > 1 ? 's' : ''} will be included
              </p>
            )}
            <button
              onClick={handleGenerate}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors"
            >
              Let Muse draft your story
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="text-center py-16">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
            <p className="text-stone-500">Muse is crafting your data story...</p>
          </div>
        )}

        {story && !isGenerating && (
          <div className="space-y-6">
            {/* Story title */}
            <input
              value={storyTitle}
              onChange={(e) => {
                setStoryTitle(e.target.value);
                setStory({ ...story, title: e.target.value });
              }}
              className="w-full text-2xl font-bold text-stone-900 bg-transparent border-none
                         focus:outline-none focus:ring-0 placeholder-stone-300"
              placeholder="Your story title..."
            />

            {/* Chapters */}
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
        )}
      </div>
    </main>
  );
}
