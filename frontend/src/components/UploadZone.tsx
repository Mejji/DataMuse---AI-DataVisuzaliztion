import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, BarChart3, MessageCircle, BookOpen, Sparkles } from 'lucide-react';
import { uploadCSV, getAnalysis } from '../lib/api';
import type { DatasetProfile } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

function generateSuggestedPrompts(profile: DatasetProfile): string[] {
  const prompts: string[] = [];
  const numericCols = profile.columns.filter(c => c.dtype.includes('int') || c.dtype.includes('float'));
  const categoricalCols = profile.columns.filter(c => c.dtype === 'object' || (c.unique_count <= 10 && c.unique_count > 1));
  
  if (numericCols.length > 0) {
    prompts.push(`What's the average ${numericCols[0].name.toLowerCase().replace(/_/g, ' ')}?`);
  }
  if (categoricalCols.length > 0) {
    prompts.push(`Show me a breakdown by ${categoricalCols[0].name.toLowerCase().replace(/_/g, ' ')}`);
  }
  if (numericCols.length >= 2) {
    prompts.push(`Compare ${numericCols[0].name.toLowerCase().replace(/_/g, ' ')} vs ${numericCols[1].name.toLowerCase().replace(/_/g, ' ')}`);
  }
  if (profile.row_count > 10) {
    prompts.push("What are the most interesting patterns in this data?");
  }
  if (numericCols.length > 0 && categoricalCols.length > 0) {
    prompts.push(`Which ${categoricalCols[0].name.toLowerCase().replace(/_/g, ' ')} has the highest ${numericCols[0].name.toLowerCase().replace(/_/g, ' ')}?`);
  }
  // Always include a general exploration prompt
  prompts.push("Give me a summary of this dataset");
  // Always include recommended visualizations
  prompts.push("Recommended Visualizations");
  
  return prompts.slice(0, 6); // Max 6 prompts
}

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Chat with your data',
    description: 'Ask questions in plain English. Muse understands what you need.',
    color: 'from-dm-coral to-dm-amber',
    bgColor: 'bg-dm-coral-light dark:bg-dm-coral/10',
  },
  {
    icon: BarChart3,
    title: 'Beautiful charts, instantly',
    description: 'Get visualizations that tell the story your data wants to share.',
    color: 'from-dm-teal to-dm-sky',
    bgColor: 'bg-dm-teal-light dark:bg-dm-teal/10',
  },
  {
    icon: BookOpen,
    title: 'Build data stories',
    description: 'Turn your findings into chapters that anyone can understand.',
    color: 'from-dm-violet to-dm-sky',
    bgColor: 'bg-violet-50 dark:bg-dm-violet/10',
  },
];

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { isUploading, setUploading, setDataset, setSuggestions, addMessage, addPanel, setAnalyzing, setSuggestedPrompts } = useDataStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadCSV(file);
      setDataset(result.dataset_id, result.profile);
      setSuggestedPrompts(generateSuggestedPrompts(result.profile));

      addMessage({
        role: 'muse',
        content: `Hey! I just looked through your file "${result.profile.filename}" — you've got ${result.profile.row_count.toLocaleString()} rows and ${result.profile.column_count} columns to work with. Let me pull up some interesting ways to look at this data...`,
        timestamp: new Date().toISOString(),
      });

      setAnalyzing(true);
      try {
        const analysis = await getAnalysis(result.dataset_id);
        setSuggestions(analysis.suggestions);

        analysis.suggestions.slice(0, 2).forEach((s: any) => {
          if (s.chart_config) {
            addPanel(s.chart_config, 'suggestion');
          }
        });

        addMessage({
          role: 'muse',
          content: `I found ${analysis.suggestions.length} visualizations that I think will be really helpful. I've put the top two on your dashboard already! Click any others below to add them, or ask me to show you something specific.`,
          timestamp: new Date().toISOString(),
        });
      } catch (analysisError) {
        addMessage({
          role: 'muse',
          content: "I wasn't able to analyze the data right now, but you can still ask me anything! Just type a question below.",
          timestamp: new Date().toISOString(),
        });
      } finally {
        setAnalyzing(false);
      }
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [setUploading, setDataset, setSuggestions, addMessage, addPanel, setAnalyzing, setSuggestedPrompts]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="flex-1 overflow-auto bg-mesh-warm relative">
      {/* Decorative background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-dm-coral/5 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-1/2 -left-48 w-80 h-80 bg-dm-teal/5 rounded-full blur-3xl animate-blob" style={{ animationDelay: '2s' }} />
        <div className="absolute -bottom-24 right-1/4 w-72 h-72 bg-dm-amber/5 rounded-full blur-3xl animate-blob" style={{ animationDelay: '4s' }} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        {/* Hero section */}
        <div className="text-center mb-12 stagger-children">
          {/* Muse avatar */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-dm-coral via-dm-amber to-dm-teal shadow-lg shadow-dm-coral/20 mb-6 animate-float">
            <Sparkles className="w-8 h-8 text-white" />
          </div>

          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-foreground tracking-tight mb-4">
            Hi, I'm <span className="bg-gradient-to-r from-dm-coral to-dm-amber bg-clip-text text-transparent">Muse</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Your friendly data analyst. Drop a spreadsheet and I'll help you find
            the stories hiding in your numbers — no tech skills needed.
          </p>
        </div>

        {/* Upload area */}
        <div className="mb-16 animate-fade-up" style={{ animationDelay: '200ms' }}>
          <div
            className={`
              relative w-full border-2 border-dashed rounded-3xl p-10
              flex flex-col items-center gap-5 transition-all duration-300 cursor-pointer
              group overflow-hidden
              ${isDragging
                ? 'border-dm-coral bg-dm-coral-light/80 dark:bg-dm-coral/10 scale-[1.02] shadow-xl shadow-dm-coral/10'
                : 'border-border hover:border-dm-coral/40 bg-card/60 backdrop-blur-sm hover:bg-card/90 hover:shadow-lg hover:shadow-dm-coral/5'
              }
              ${isUploading ? 'pointer-events-none' : ''}
            `}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('csv-input')?.click()}
          >
            {/* Subtle animated ring on hover */}
            <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-[-1px] rounded-3xl bg-gradient-to-r from-dm-coral/20 via-dm-amber/20 to-dm-teal/20 animate-gradient" />
              <div className="absolute inset-[1px] rounded-3xl bg-card/90" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-4">
              {isUploading ? (
                <>
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-dm-coral to-dm-amber flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-dm-coral to-dm-amber animate-ping opacity-20" />
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-display font-semibold text-lg">Analyzing your data...</p>
                    <p className="text-sm text-muted-foreground mt-1">Muse is reading through every column and row</p>
                  </div>
                </>
              ) : (
                <>
                  <div className={`
                    w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                    ${isDragging
                      ? 'bg-gradient-to-br from-dm-coral to-dm-amber scale-110 shadow-lg shadow-dm-coral/30'
                      : 'bg-gradient-to-br from-dm-coral/10 to-dm-amber/10 group-hover:from-dm-coral/20 group-hover:to-dm-amber/20'
                    }
                  `}>
                    {isDragging ? (
                      <FileSpreadsheet className="w-8 h-8 text-white" />
                    ) : (
                      <Upload className="w-8 h-8 text-dm-coral group-hover:scale-110 transition-transform duration-300" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-display font-semibold text-lg">
                      {isDragging ? 'Drop it right here!' : 'Drop your CSV file here'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or <span className="text-dm-coral font-medium underline underline-offset-2 decoration-dm-coral/30 group-hover:decoration-dm-coral/60 transition-colors">browse your files</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                    <span className="w-1 h-1 rounded-full bg-dm-teal/40" />
                    CSV files up to 50MB
                    <span className="w-1 h-1 rounded-full bg-dm-teal/40" />
                    Up to 50,000 rows
                  </div>
                </>
              )}
            </div>
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative bg-card/70 backdrop-blur-sm rounded-2xl p-6 border border-border/50
                         hover:bg-card hover:shadow-lg hover:shadow-dm-coral/5 hover:border-border
                         transition-all duration-300 hover:-translate-y-1"
            >
              <div className={`w-10 h-10 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4
                              group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className={`w-5 h-5 bg-gradient-to-br ${feature.color} bg-clip-text`}
                  style={{ color: feature.color.includes('coral') ? '#f97066' : feature.color.includes('teal') ? '#14b8a6' : '#8b5cf6' }}
                />
              </div>
              <h3 className="font-display font-bold text-foreground text-sm mb-1.5">
                {feature.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground/50 mt-12 animate-fade-in" style={{ animationDelay: '600ms' }}>
          Your data stays private and is never shared. Muse analyzes everything locally.
        </p>
      </div>
    </div>
  );
}
