import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Sparkles, BookOpen, Download, Plus, Library, Trash2, ChevronDown, Send, Wand2 } from 'lucide-react';
import { StoryChapterCard } from './StoryChapter';
import { generateStory, getStoryAngles } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';
import type { StoryChapter, StoryAngle } from '../lib/api';
import { exportDashboardAsPNG } from '../lib/exportUtils';

export function StoryBuilder() {
  const {
    datasetId, story, setStory, setStoryMode, pinnedInsights,
    savedStories, saveStoryToLibrary, loadStoryFromLibrary, deleteStoryFromLibrary,
  } = useDataStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyTitle, setStoryTitle] = useState(story?.title || '');
  const [angles, setAngles] = useState<StoryAngle[]>([]);
  const [selectedAngle, setSelectedAngle] = useState('overview');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAnglePicker, setShowAnglePicker] = useState(!story);

  useEffect(() => {
    getStoryAngles().then((res) => setAngles(res.angles)).catch(() => {});
  }, []);

  useEffect(() => {
    if (story) setStoryTitle(story.title);
  }, [story]);

  const handleGenerate = async () => {
    if (!datasetId) return;
    setIsGenerating(true);
    setShowAnglePicker(false);
    try {
      const result = await generateStory(
        datasetId,
        pinnedInsights,
        selectedAngle === 'custom' ? '' : selectedAngle,
        selectedAngle === 'custom' ? customPrompt : '',
      );
      setStory(result);
      setStoryTitle(result.title);
    } catch {
      alert('Failed to generate story. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToLibrary = () => {
    saveStoryToLibrary(selectedAngle);
  };

  const handleNewStory = () => {
    setStory(null);
    setShowAnglePicker(true);
    setCustomPrompt('');
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
          {/* Library toggle */}
          {savedStories.length > 0 && (
            <button
              onClick={() => setShowLibrary(!showLibrary)}
              className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border/60 text-foreground rounded-xl
                         hover:bg-accent hover:border-border text-sm font-display font-semibold transition-all duration-200"
            >
              <Library className="w-4 h-4" />
              <span className="hidden sm:inline">{savedStories.length}</span>
            </button>
          )}

          {story && !isGenerating && (
            <>
              <button
                onClick={handleSaveToLibrary}
                className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-card border border-border/60 text-foreground rounded-xl
                           hover:bg-accent hover:border-border text-sm font-display font-semibold transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => exportDashboardAsPNG('story-container')}
                className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-card border border-border/60 text-foreground rounded-xl
                           hover:bg-accent hover:border-border text-sm font-display font-semibold transition-all duration-200"
              >
                <Download className="w-4 h-4" />
                PNG
              </button>
            </>
          )}

          {story && !isGenerating && (
            <button
              onClick={handleNewStory}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-dm-violet to-dm-sky text-white rounded-xl
                         hover:shadow-lg hover:shadow-dm-violet/20 text-sm font-display font-semibold transition-all duration-200"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">New Story</span>
            </button>
          )}
        </div>
      </div>

      {/* Story library sidebar */}
      {showLibrary && (
        <div className="border-b border-border/60 bg-card/50 backdrop-blur-sm px-4 md:px-6 py-4">
          <h3 className="text-sm font-display font-bold text-foreground mb-3">Saved Stories</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {savedStories.map((s) => (
              <div
                key={s.id}
                className="flex-shrink-0 w-56 bg-card border border-border/60 rounded-xl p-3 hover:border-dm-violet/40 transition-all duration-200 group"
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-medium text-dm-violet bg-dm-violet/10 px-2 py-0.5 rounded-full">
                    {s.angle || 'custom'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteStoryFromLibrary(s.id); }}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => { loadStoryFromLibrary(s.id); setShowLibrary(false); }}
                  className="text-left w-full"
                >
                  <p className="text-sm font-semibold text-foreground truncate">{s.story.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.story.chapters.length} chapter{s.story.chapters.length !== 1 ? 's' : ''} · {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Story content */}
      <div id="story-container" className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-10">

        {/* ── Angle Picker (shown before generating or for new story) ── */}
        {showAnglePicker && !isGenerating && (
          <div className="animate-fade-up">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-dm-violet/10 to-dm-sky/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-10 h-10 text-dm-violet/40" />
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-3">
                {savedStories.length > 0 ? 'Create another story' : "Ready to tell your data's story?"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Pick an angle below, or write your own prompt. Each generates a unique story from your data.
              </p>
              {pinnedInsights.length > 0 && (
                <p className="text-xs font-medium text-dm-violet bg-violet-50 dark:bg-dm-violet/10 inline-block px-3 py-1.5 rounded-full mt-4">
                  {pinnedInsights.length} pinned insight{pinnedInsights.length > 1 ? 's' : ''} will be included
                </p>
              )}
            </div>

            {/* Angle cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {angles.map((angle) => (
                <button
                  key={angle.id}
                  onClick={() => setSelectedAngle(angle.id)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 ${
                    selectedAngle === angle.id
                      ? 'border-dm-coral bg-dm-coral/5 shadow-sm'
                      : 'border-border/60 bg-card hover:border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-display font-bold text-foreground">{angle.label}</span>
                    {selectedAngle === angle.id && (
                      <span className="w-2 h-2 rounded-full bg-dm-coral animate-fade-in" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{angle.description}</p>
                </button>
              ))}
            </div>

            {/* Custom prompt input */}
            {selectedAngle === 'custom' && (
              <div className="mb-6 animate-fade-in">
                <label className="block text-sm font-display font-semibold text-foreground mb-2">
                  Describe the story you want
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. Focus on seasonal trends in the South region and compare Q3 vs Q4 performance..."
                  className="w-full text-sm bg-card border border-border/60 rounded-xl p-4 placeholder-muted-foreground/40
                             focus:outline-none focus:ring-2 focus:ring-dm-coral/20 focus:border-dm-coral/30
                             transition-all duration-200 resize-none"
                />
                {/* Quick prompt suggestions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    'Focus on top performers only',
                    'Compare regions side by side',
                    'Highlight anomalies and outliers',
                    'Write it for a board presentation',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setCustomPrompt(suggestion)}
                      className="text-xs px-3 py-1.5 bg-accent/50 text-muted-foreground hover:text-foreground
                                 border border-border/40 rounded-full hover:border-dm-coral/30 transition-all duration-200"
                    >
                      <Wand2 className="w-3 h-3 inline mr-1" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            <div className="text-center">
              <button
                onClick={handleGenerate}
                disabled={selectedAngle === 'custom' && !customPrompt.trim()}
                className="px-6 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r from-dm-coral to-dm-amber text-white rounded-2xl
                           hover:shadow-lg hover:shadow-dm-coral/20 font-display font-bold
                           disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none
                           transition-all duration-200 hover:scale-105"
              >
                <Sparkles className="w-4 h-4 inline mr-2" />
                {selectedAngle === 'custom' ? 'Generate Custom Story' : `Generate ${angles.find(a => a.id === selectedAngle)?.label || 'Story'}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Generating spinner ── */}
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

        {/* ── Story view ── */}
        {story && !isGenerating && !showAnglePicker && (
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
                    datasetId={datasetId}
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
