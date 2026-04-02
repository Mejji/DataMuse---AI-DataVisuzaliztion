import { useState } from 'react';
import { Pin, PlusCircle, Check } from 'lucide-react';
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
    <div className={`flex flex-col gap-2 ${isMuse ? '' : 'items-end'}`}>
      {isMuse && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-xs font-bold text-indigo-600">M</span>
          </div>
          <span className="text-xs font-medium text-stone-500">Muse</span>
        </div>
      )}
      <div
        className={`
          rounded-xl px-4 py-3 text-sm leading-relaxed max-w-[90%]
          ${isMuse
            ? 'bg-stone-100 text-stone-700'
            : 'bg-indigo-600 text-white ml-auto'
          }
        `}
      >
        {message.content}
      </div>

      {/* Inline chart preview */}
      {message.chart_config && (
        <div className="bg-white border border-stone-200 rounded-xl p-3 max-w-[95%]">
          <ChartRenderer config={message.chart_config} height={200} />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                addPanel(message.chart_config!, 'chat');
                setAddedToDashboard(true);
              }}
              disabled={addedToDashboard}
              className={`flex items-center gap-1 text-xs font-medium ${
                addedToDashboard
                  ? 'text-emerald-600'
                  : 'text-indigo-600 hover:text-indigo-800'
              }`}
            >
              {addedToDashboard ? (
                <>
                  <Check className="w-3 h-3" />
                  Added to dashboard
                </>
              ) : (
                <>
                  <PlusCircle className="w-3 h-3" />
                  Add to dashboard
                </>
              )}
            </button>
            <button
              onClick={() => pinInsight(message.content)}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"
            >
              <Pin className="w-3 h-3" />
              Pin to story
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
