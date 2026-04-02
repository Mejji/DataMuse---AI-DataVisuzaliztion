import { useState } from 'react';
import { GripVertical, Trash2, Edit3, Check } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { StoryChapter as StoryChapterType } from '../lib/api';

interface StoryChapterProps {
  chapter: StoryChapterType;
  onUpdate: (updated: StoryChapterType) => void;
  onDelete: () => void;
}

export function StoryChapterCard({ chapter, onUpdate, onDelete }: StoryChapterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chapter.title);
  const [editNarrative, setEditNarrative] = useState(chapter.narrative);

  const handleSave = () => {
    onUpdate({ ...chapter, title: editTitle, narrative: editNarrative });
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-border/60 rounded-2xl p-7 group shadow-sm
                    hover:shadow-md hover:border-border transition-all duration-300">
      <div className="flex items-start gap-4">
        <div className="mt-1 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors">
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-display font-bold uppercase tracking-widest text-dm-coral bg-dm-coral-light px-3 py-1 rounded-full">
              Chapter {chapter.order}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {isEditing ? (
                <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => setIsEditing(true)} className="p-1.5 text-muted-foreground hover:text-dm-teal hover:bg-dm-teal-light rounded-lg transition-colors">
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
                className="w-full text-xl font-display font-bold text-dm-slate border-b border-border pb-2 mb-4
                           focus:outline-none focus:border-dm-coral/40 transition-colors"
              />
              <textarea
                value={editNarrative}
                onChange={(e) => setEditNarrative(e.target.value)}
                rows={6}
                className="w-full text-sm text-foreground leading-relaxed border border-border rounded-xl p-4
                           focus:outline-none focus:ring-2 focus:ring-dm-coral/20 focus:border-dm-coral/30
                           transition-all duration-200"
              />
            </>
          ) : (
            <>
              <h3 className="text-xl font-display font-bold text-dm-slate mb-3">{chapter.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{chapter.narrative}</p>
            </>
          )}

          {chapter.chart_config && (
            <div className="mt-5 border-t border-border/40 pt-5">
              <ChartRenderer config={chapter.chart_config} height={300} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
