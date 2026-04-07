import { useState, useEffect, useRef } from 'react';
import { X, Pin, Maximize2, Minimize2, Download, FileText, FileSpreadsheet, FileCode } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import { TableRenderer } from './TableRenderer';
import { ChartDetailModal } from './ChartDetailModal';
import type { ChartConfig, TableConfig } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';
import { exportChartAsPDF, exportDataAsCSV, exportDataAsExcel } from '../lib/exportUtils';

interface DashboardPanelProps {
  id: string;
  chart?: ChartConfig;
  table?: TableConfig;
  source: 'suggestion' | 'chat' | 'manual';
  isHighlighted: boolean;
}

export function DashboardPanel({ id, chart, table, source, isHighlighted }: DashboardPanelProps) {
  const { removePanel, pinInsight, highlightPanel } = useDataStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHighlighted && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const timer = setTimeout(() => highlightPanel(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted, highlightPanel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sourceLabel = source === 'chat' ? 'From conversation' : source === 'suggestion' ? 'Suggested by Muse' : '';
  const sourceColor = source === 'chat' ? 'text-dm-teal bg-dm-teal-light dark:bg-dm-teal/10' : 'text-dm-coral bg-dm-coral-light dark:bg-dm-coral/10';

  const title = table?.title ?? chart?.title ?? 'Dashboard Panel';

  const handleExportPDF = () => {
    exportChartAsPDF(id, title);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    if (chart?.data) exportDataAsCSV(chart.data, title);
    setShowExportMenu(false);
  };

  const handleExportExcel = () => {
    if (chart?.data) exportDataAsExcel(chart.data, title);
    setShowExportMenu(false);
  };

  return (
    <div
      id={id}
      ref={panelRef}
      className={`
        bg-card border rounded-2xl p-6 transition-all duration-500 group relative
        hover:-translate-y-0.5
        ${isHighlighted
          ? 'border-dm-coral/40 shadow-xl shadow-dm-coral/10 ring-2 ring-dm-coral/20'
          : 'border-border/60 shadow-sm hover:shadow-lg hover:shadow-dm-coral/5 hover:border-border'
        }
        ${isExpanded ? 'col-span-full' : ''}
      `}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 pr-4">
          <h3 className="font-display font-bold text-foreground text-sm truncate" title={title}>{title}</h3>
          {sourceLabel && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${sourceColor}`}>
              {sourceLabel}
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {chart && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-1.5 text-muted-foreground hover:text-dm-sky hover:bg-dm-sky/10 rounded-lg transition-all duration-200"
                title="Export"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-card border border-border/60 rounded-xl shadow-lg z-10 py-1 overflow-hidden">
                  <button onClick={handleExportPDF} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" /> Export as PDF
                  </button>
                  <button onClick={handleExportCSV} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2">
                    <FileCode className="w-3.5 h-3.5 text-muted-foreground" /> Export as CSV
                  </button>
                  <button onClick={handleExportExcel} className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" /> Export as Excel
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => pinInsight(title)}
            className="p-1.5 text-muted-foreground hover:text-dm-violet hover:bg-dm-violet/10 rounded-lg transition-all duration-200"
            title="Pin to story"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          {chart && (
            <button
              onClick={() => {
                setIsExpanded(!isExpanded);
                setIsDetailOpen(true);
              }}
              className="p-1.5 text-muted-foreground hover:text-dm-teal hover:bg-dm-teal/10 rounded-lg transition-all duration-200"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => removePanel(id)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all duration-200"
            title="Remove from dashboard"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive chart or table */}
      <div 
        className={chart ? "cursor-pointer" : ""} 
        onClick={() => chart && setIsDetailOpen(true)}
      >
        {table ? (
          <TableRenderer config={table} maxHeight={isExpanded ? 500 : 320} />
        ) : chart ? (
          <ChartRenderer config={chart} height={isExpanded ? 500 : 320} />
        ) : null}
      </div>

      {chart && (
        <ChartDetailModal 
          chart={chart} 
          isOpen={isDetailOpen} 
          onClose={() => setIsDetailOpen(false)} 
        />
      )}
    </div>
  );
}
