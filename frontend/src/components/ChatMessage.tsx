import { useState } from 'react';
import { Pin, PlusCircle, Check, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChartRenderer } from './ChartRenderer';
import { TableRenderer } from './TableRenderer';
import { ChartDetailModal } from './ChartDetailModal';
import { RecommendedCharts } from './RecommendedCharts';
import { DataMutationPreview } from './DataMutationPreview';
import type { ChatMessage as ChatMessageType } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { addPanel, pinInsight } = useDataStore();
  const isMuse = message.role === 'muse';
  const [addedToDashboard, setAddedToDashboard] = useState(false);
  const [addedTableToDashboard, setAddedTableToDashboard] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
          rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[95%] sm:max-w-[90%]
          ${isMuse
            ? 'bg-card border border-border/60 text-foreground shadow-sm'
            : 'bg-gradient-to-r from-dm-slate to-dm-slate/90 text-white ml-auto shadow-md shadow-dm-slate/10'
          }
        `}
      >
        {isMuse ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              h1: ({ children }) => <h3 className="text-base font-display font-bold mb-2 mt-3 first:mt-0">{children}</h3>,
              h2: ({ children }) => <h3 className="text-sm font-display font-bold mb-1.5 mt-2.5 first:mt-0">{children}</h3>,
              h3: ({ children }) => <h4 className="text-sm font-display font-semibold mb-1 mt-2 first:mt-0">{children}</h4>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
              code: ({ className, children }) => {
                const isBlock = className?.includes('language-');
                return isBlock ? (
                  <pre className="bg-muted/60 rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs">
                    <code className={className}>{children}</code>
                  </pre>
                ) : (
                  <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                );
              },
              pre: ({ children }) => <>{children}</>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-dm-coral/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          message.content
        )}
      </div>

      {/* Inline chart preview */}
      {message.chart_config && (
        <div 
          className="bg-card border border-border/60 rounded-2xl p-4 max-w-[95%] shadow-sm
                        hover:shadow-md transition-shadow duration-200 animate-scale-in cursor-pointer"
          onClick={() => setIsDetailOpen(true)}
        >
          <ChartRenderer config={message.chart_config} height={160} />
          <div className="flex gap-3 mt-3 pt-3 border-t border-border/40">
            <button
              onClick={(e) => {
                e.stopPropagation();
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
              onClick={(e) => {
                e.stopPropagation();
                pinInsight(message.content);
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-dm-violet transition-colors duration-200"
            >
              <Pin className="w-3.5 h-3.5" />
              Pin to story
            </button>
          </div>
        </div>
      )}

      {/* Inline table preview */}
      {message.table_config && (
        <div className="bg-card border border-border/60 rounded-2xl p-4 max-w-[95%] shadow-sm hover:shadow-md transition-shadow duration-200 animate-scale-in">
          <TableRenderer config={message.table_config} maxHeight={300} />
          <div className="flex gap-3 mt-3 pt-3 border-t border-border/40">
            <button
              onClick={() => {
                addPanel(undefined, 'chat', message.table_config!);
                setAddedTableToDashboard(true);
              }}
              disabled={addedTableToDashboard}
              className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-200 ${
                addedTableToDashboard
                  ? 'text-emerald-600'
                  : 'text-dm-coral hover:text-dm-coral/80'
              }`}
            >
              {addedTableToDashboard ? (
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
          </div>
        </div>
      )}

      {/* Recommended charts grid */}
      {message.recommended_charts && message.recommended_charts.length > 0 && (
        <div className="animate-scale-in">
          <RecommendedCharts charts={message.recommended_charts} />
        </div>
      )}

      {/* Data mutation preview */}
      {message.mutation_preview && (
        <div className="animate-scale-in max-w-[95%]">
          <DataMutationPreview preview={message.mutation_preview} />
        </div>
      )}

      {message.chart_config && (
        <ChartDetailModal
          chart={message.chart_config}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </div>
  );
}
