import { useState } from 'react';
import { GripVertical, Trash2, Edit3, Check, Wand2, Loader2, Send } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import { refineChapter } from '../lib/api';
import type { StoryChapter as StoryChapterType } from '../lib/api';

interface StoryChapterProps {
  chapter: StoryChapterType;
  datasetId: string | null;
  onUpdate: (updated: StoryChapterType) => void;
  onDelete: () => void;
}

const DEFAULT_SUGGESTIONS = [
  'Make it more concise',
  'Add specific numbers',
  'Make the tone more formal',
  'Simplify the language',
  'Add a comparison angle',
  'Focus on the key takeaway',
];

export function StoryChapterCard({ chapter, datasetId, onUpdate, onDelete }: StoryChapterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chapter.title);
  const [editNarrative, setEditNarrative] = useState(chapter.narrative);

  // AI refinement state
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS.slice(0, 3));

  const handleSave = () => {
    onUpdate({ ...chapter, title: editTitle, narrative: editNarrative });
    setIsEditing(false);
  };

  const handleAiRefine = async (instruction: string) => {
    if (!datasetId || !instruction.trim() || isRefining) return;
    setIsRefining(true);
    try {
      const result = await refineChapter(
        datasetId,
        chapter.title,
        chapter.narrative,
        instruction.trim(),
      );
      // Apply the AI changes
      const updated = { ...chapter, title: result.title, narrative: result.narrative };
      onUpdate(updated);
      setEditTitle(result.title);
      setEditNarrative(result.narrative);
      // Update suggestions with AI-generated ones
      if (result.suggestions?.length) {
        setSuggestions(result.suggestions);
      }
      setAiInstruction('');
    } catch {
      // Keep current text, just clear input
    } finally {
      setIsRefining(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleAiRefine(suggestion);
  };

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-4 sm:p-5 md:p-7 group shadow-sm
                    hover:shadow-md hover:border-border transition-all duration-300">
      <div className="flex items-start gap-2 sm:gap-4">
        <div className="hidden sm:block mt-1 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors">
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-display font-bold uppercase tracking-widest text-dm-coral bg-dm-coral-light dark:bg-dm-coral/10 px-3 py-1 rounded-full">
              Chapter {chapter.order}
            </span>
            <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
              {/* AI refine toggle */}
              <button
                onClick={() => { setShowAiInput(!showAiInput); setIsEditing(false); }}
                className={`p-1.5 rounded-lg transition-colors ${
                  showAiInput
                    ? 'text-dm-violet bg-dm-violet/10'
                    : 'text-muted-foreground hover:text-dm-violet hover:bg-dm-violet/5'
                }`}
                title="Refine with AI"
              >
                <Wand2 className="w-4 h-4" />
              </button>
              {isEditing ? (
                <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors">
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => { setIsEditing(true); setShowAiInput(false); }} className="p-1.5 text-muted-foreground hover:text-dm-teal hover:bg-dm-teal-light dark:hover:bg-dm-teal/10 rounded-lg transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isEditing ? (
            <>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-xl font-display font-bold text-foreground bg-transparent border-b border-border pb-2 mb-4
                           focus:outline-none focus:border-dm-coral/40 transition-colors"
              />
              <textarea
                value={editNarrative}
                onChange={(e) => setEditNarrative(e.target.value)}
                rows={6}
                className="w-full text-sm text-foreground bg-transparent leading-relaxed border border-border rounded-xl p-4
                           focus:outline-none focus:ring-2 focus:ring-dm-coral/20 focus:border-dm-coral/30
                           transition-all duration-200"
              />
            </>
          ) : (
            <>
              <h3 className="text-lg sm:text-xl font-display font-bold text-foreground mb-3">{chapter.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{chapter.narrative}</p>
            </>
          )}

          {chapter.chart_config && (
            <div className="mt-5 border-t border-border/40 pt-5">
              <ChartRenderer config={chapter.chart_config} height={240} />
            </div>
          )}

          {/* ── AI Refine Panel ── */}
          {showAiInput && (
            <div className="mt-5 border-t border-border/40 pt-5 animate-fade-in">
              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2 mb-3">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    disabled={isRefining}
                    className="text-xs px-3 py-1.5 bg-accent/50 text-muted-foreground hover:text-foreground
                               border border-border/40 rounded-full hover:border-dm-violet/30
                               disabled:opacity-50 transition-all duration-200"
                  >
                    <Wand2 className="w-3 h-3 inline mr-1" />
                    {s}
                  </button>
                ))}
              </div>

              {/* Custom instruction input */}
              <div className="flex gap-2">
                <input
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiRefine(aiInstruction); } }}
                  placeholder="Tell Muse how to change this chapter..."
                  disabled={isRefining}
                  className="flex-1 text-sm bg-background border border-border/60 rounded-xl px-4 py-2.5
                             placeholder-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-dm-violet/20
                             focus:border-dm-violet/30 disabled:opacity-50 transition-all duration-200"
                />
                <button
                  onClick={() => handleAiRefine(aiInstruction)}
                  disabled={isRefining || !aiInstruction.trim()}
                  className="px-4 py-2.5 bg-gradient-to-r from-dm-violet to-dm-sky text-white rounded-xl
                             hover:shadow-lg hover:shadow-dm-violet/20 disabled:from-muted disabled:to-muted
                             disabled:text-muted-foreground disabled:shadow-none text-sm font-semibold transition-all duration-200"
                >
                  {isRefining ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              {isRefining && (
                <p className="text-xs text-muted-foreground mt-2 animate-pulse">Muse is rewriting...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
