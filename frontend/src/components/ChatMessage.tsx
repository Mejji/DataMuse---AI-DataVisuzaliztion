import { useState } from 'react';
import { Pin, PlusCircle, Check, Sparkles } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { ChatMessage as ChatMessageType } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { addPanel, pinInsight } = useDataStore();
  const isMuse = message.role === 'muse';
  const [addedToDashboard, setAddedToDashboard] = useState(false);

  return (
    <div className={`flex flex-col gap-2 animate-fade-up ${isMuse ? '' : 'items-end'}`}>
      {isMuse && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-dm-coral/20 to-dm-amber/20 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-dm-coral" />
          </div>
          <span className="text-xs font-display font-semibold text-foreground/70">Muse</span>
        </div>
      )}
      <div
        className={`
          rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[90%]
          ${isMuse
            ? 'bg-card border border-border/60 text-foreground shadow-sm'
            : 'bg-gradient-to-r from-dm-slate to-dm-slate/90 text-white ml-auto shadow-md shadow-dm-slate/10'
          }
        `}
      >
        {message.content}
      </div>

      {/* Inline chart preview */}
      {message.chart_config && (
        <div className="bg-card border border-border/60 rounded-2xl p-4 max-w-[95%] shadow-sm
                        hover:shadow-md transition-shadow duration-200 animate-scale-in">
          <ChartRenderer config={message.chart_config} height={200} />
          <div className="flex gap-3 mt-3 pt-3 border-t border-border/40">
            <button
              onClick={() => {
                addPanel(message.chart_config!, 'chat');
                setAddedToDashboard(true);
              }}
              disabled={addedToDashboard}
              className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-200 ${
                addedToDashboard
                  ? 'text-emerald-600'
                  : 'text-dm-coral hover:text-dm-coral/80'
              }`}
            >
              {addedToDashboard ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Added to dashboard
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add to dashboard
                </>
              )}
            </button>
            <button
              onClick={() => pinInsight(message.content)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-dm-violet transition-colors duration-200"
            >
              <Pin className="w-3.5 h-3.5" />
              Pin to story
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
