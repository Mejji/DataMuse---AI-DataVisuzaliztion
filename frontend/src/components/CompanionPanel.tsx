import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen, Sparkles, MessageCircleQuestion } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { sendMessage } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

export function CompanionPanel() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    datasetId, messages, addMessage, isChatLoading, setChatLoading,
    addPanel, setStoryMode, suggestedPrompts, setSuggestedPrompts
  } = useDataStore();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !datasetId || isChatLoading) return;

    const userMessage = input.trim();
    setInput('');

    addMessage({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    setChatLoading(true);
    try {
      const response = await sendMessage(userMessage, datasetId);
      addMessage(response);

      if (response.chart_config) {
        addPanel(response.chart_config, 'chat');
      }
    } catch {
      addMessage({
        role: 'muse',
        content: "Sorry, I hit a snag trying to answer that. Could you try rephrasing?",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handlePromptClick = async (promptText: string) => {
    if (!datasetId || isChatLoading) return;
    
    // Remove the clicked prompt from the list
    setSuggestedPrompts(suggestedPrompts.filter(p => p !== promptText));

    addMessage({
      role: 'user',
      content: promptText,
      timestamp: new Date().toISOString(),
    });

    setChatLoading(true);
    try {
      const response = await sendMessage(promptText, datasetId);
      addMessage(response);
      if (response.chart_config) {
        addPanel(response.chart_config, 'chat');
      }
    } catch {
      addMessage({
        role: 'muse',
        content: "Sorry, I hit a snag trying to answer that. Could you try rephrasing?",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <aside className="w-[400px] border-l border-border/60 bg-white/80 backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dm-coral via-dm-amber to-dm-teal flex items-center justify-center shadow-sm shadow-dm-coral/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
          </div>
          <div>
            <h2 className="font-display font-bold text-dm-slate text-sm">Muse</h2>
            <p className="text-xs text-muted-foreground">Your data analyst</p>
          </div>
        </div>
        {datasetId && (
          <button
            onClick={() => setStoryMode(true)}
            className="flex items-center gap-1.5 text-xs font-display font-semibold text-dm-coral
                       hover:text-dm-coral/80 bg-dm-coral-light hover:bg-dm-coral/10 px-3 py-2 rounded-xl
                       transition-all duration-200 hover:shadow-sm"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Build Story
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-5">
        {messages.length === 0 && (
          <div className="text-center py-12 animate-fade-up">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-dm-coral/10 to-dm-amber/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-dm-coral/50" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">Upload a CSV to start chatting</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Muse will analyze it and suggest insights</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isChatLoading && (
          <div className="flex items-center gap-3 text-muted-foreground animate-fade-in">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-dm-coral/10 to-dm-amber/10 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-dm-coral" />
            </div>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-dm-coral/40 animate-pulse-soft" />
              <span className="w-2 h-2 rounded-full bg-dm-amber/40 animate-pulse-soft" style={{ animationDelay: '200ms' }} />
              <span className="w-2 h-2 rounded-full bg-dm-teal/40 animate-pulse-soft" style={{ animationDelay: '400ms' }} />
            </div>
            <span className="text-sm">Muse is thinking...</span>
          </div>
        )}
      </div>

      {/* Suggested Prompts */}
      {suggestedPrompts.length > 0 && datasetId && messages.length <= 3 && (
        <div className="px-4 py-3 border-t border-border/60 bg-white/40">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
            <MessageCircleQuestion className="w-3.5 h-3.5 text-dm-amber" />
            <span>Try asking:</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handlePromptClick(prompt)}
                className="flex-shrink-0 max-w-[200px] truncate px-3 py-1.5 rounded-full text-xs
                           bg-dm-coral-light/50 border border-dm-coral/20 text-dm-slate
                           hover:bg-dm-coral-light hover:border-dm-coral/40 hover:shadow-sm hover:scale-105
                           transition-all duration-200 animate-chip-in"
                style={{ animationDelay: `${i * 100}ms` }}
                title={prompt}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border/60 bg-white/60">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={datasetId ? "Ask Muse about your data..." : "Upload a CSV first"}
            disabled={!datasetId || isChatLoading}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-dm-coral/20 focus:border-dm-coral/40
                       disabled:bg-muted disabled:text-muted-foreground/40
                       placeholder:text-muted-foreground/50
                       transition-all duration-200"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !datasetId || isChatLoading}
            className="p-2.5 bg-gradient-to-r from-dm-coral to-dm-amber text-white rounded-xl
                       hover:shadow-md hover:shadow-dm-coral/20 hover:scale-105
                       disabled:from-muted disabled:to-muted disabled:text-muted-foreground/40
                       disabled:shadow-none disabled:scale-100
                       transition-all duration-200"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
