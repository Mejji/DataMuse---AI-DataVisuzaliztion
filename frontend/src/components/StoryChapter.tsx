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
    <div className="bg-white border border-stone-200 rounded-2xl p-6 group">
      <div className="flex items-start gap-3">
        <div className="mt-1 cursor-grab text-stone-300 hover:text-stone-500">
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              Chapter {chapter.order}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isEditing ? (
                <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => setIsEditing(true)} className="p-1.5 text-stone-400 hover:bg-stone-100 rounded-lg">
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onDelete} className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isEditing ? (
            <>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-lg font-semibold text-stone-800 border-b border-stone-300 pb-1 mb-3 focus:outline-none focus:border-indigo-400"
              />
              <textarea
                value={editNarrative}
                onChange={(e) => setEditNarrative(e.target.value)}
                rows={6}
                className="w-full text-sm text-stone-600 leading-relaxed border border-stone-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-stone-800 mb-2">{chapter.title}</h3>
              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">{chapter.narrative}</p>
            </>
          )}

          {chapter.chart_config && (
            <div className="mt-4 border-t border-stone-100 pt-4">
              <ChartRenderer config={chapter.chart_config} height={300} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
