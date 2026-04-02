import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { sendMessage } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

export function CompanionPanel() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    datasetId, messages, addMessage, isChatLoading, setChatLoading,
    addPanel, setStoryMode,
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

      // If response has a chart, auto-add it as a new panel on the dashboard
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
    <aside className="w-96 border-l border-stone-200 bg-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-sm font-bold text-indigo-600">M</span>
          </div>
          <div>
            <h2 className="font-semibold text-stone-800 text-sm">Muse</h2>
            <p className="text-xs text-stone-400">Your friendly data analyst</p>
          </div>
        </div>
        {datasetId && (
          <button
            onClick={() => setStoryMode(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Build Story
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-stone-400 text-sm">Upload a CSV to start chatting with Muse</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isChatLoading && (
          <div className="flex items-center gap-2 text-stone-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Muse is thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-stone-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={datasetId ? "Ask about your data..." : "Upload a CSV first"}
            disabled={!datasetId || isChatLoading}
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400
                       disabled:bg-stone-50 disabled:text-stone-300"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !datasetId || isChatLoading}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
                       disabled:bg-stone-200 disabled:text-stone-400 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
