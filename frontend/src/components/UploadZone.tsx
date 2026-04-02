import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { uploadCSV, getAnalysis } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { isUploading, setUploading, setDataset, setSuggestions, addMessage, addPanel } = useDataStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadCSV(file);
      setDataset(result.dataset_id, result.profile);

      // Add welcome message from Muse
      addMessage({
        role: 'muse',
        content: `Hey! I just looked through your file "${result.profile.filename}" — you've got ${result.profile.row_count.toLocaleString()} rows and ${result.profile.column_count} columns to work with. Let me pull up some interesting ways to look at this data...`,
        timestamp: new Date().toISOString(),
      });

      // Fetch AI suggestions
      const analysis = await getAnalysis(result.dataset_id);
      setSuggestions(analysis.suggestions);

      // Auto-add the first 2 suggestions to the dashboard so it's not empty
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
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [setUploading, setDataset, setSuggestions, addMessage]);

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
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        className={`
          w-full max-w-lg border-2 border-dashed rounded-2xl p-12
          flex flex-col items-center gap-4 transition-all cursor-pointer
          ${isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('csv-input')?.click()}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
            <p className="text-stone-600 font-medium">Analyzing your data...</p>
            <p className="text-sm text-stone-400">This usually takes a few seconds</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              {isDragging ? (
                <FileSpreadsheet className="w-8 h-8 text-indigo-500" />
              ) : (
                <Upload className="w-8 h-8 text-indigo-500" />
              )}
            </div>
            <div className="text-center">
              <p className="text-stone-700 font-medium">
                {isDragging ? 'Drop it right here!' : 'Drop your CSV file here'}
              </p>
              <p className="text-sm text-stone-400 mt-1">
                or click to browse your files
              </p>
            </div>
            <p className="text-xs text-stone-300">Up to 50MB, max 50,000 rows</p>
          </>
        )}
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
}
