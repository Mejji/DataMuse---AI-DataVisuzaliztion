import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Table as TableIcon, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { ChartConfig } from '../lib/api';

interface ChartDetailModalProps {
  chart: ChartConfig;
  isOpen: boolean;
  onClose: () => void;
}

type SortDirection = 'asc' | 'desc' | null;

export function ChartDetailModal({ chart, isOpen, onClose }: ChartDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'chart' | 'data'>('chart');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, handleEscape]);

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const sortedData = useMemo(() => {
    if (!chart.data) return [];
    if (!sortColumn || !sortDirection) return chart.data;

    return [...chart.data].sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      
      if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [chart.data, sortColumn, sortDirection]);

  if (!isOpen) return null;

  const columns = chart.data && chart.data.length > 0 ? Object.keys(chart.data[0]) : [];
  const displayData = sortedData.slice(0, 200);
  const totalRows = chart.data?.length || 0;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col animate-scale-in overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <h2 className="font-display font-bold text-xl text-foreground truncate pr-4">
            {chart.title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-4 pt-4 border-b border-border/60">
          <button
            onClick={() => setActiveTab('chart')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'chart'
                ? 'border-dm-coral text-dm-coral'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Chart
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'data'
                ? 'border-dm-teal text-dm-teal'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            Data Table
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'chart' ? (
            <div className="w-full h-full min-h-[500px] flex items-center justify-center">
              <ChartRenderer config={chart} height={500} />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="mb-4 text-sm text-muted-foreground">
                Showing {displayData.length} of {totalRows} rows
              </div>
              <div className="flex-1 overflow-auto border border-border/60 rounded-xl">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0 z-10">
                    <tr>
                      {columns.map((col) => (
                        <th 
                          key={col} 
                          className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/80 transition-colors"
                          onClick={() => handleSort(col)}
                        >
                          <div className="flex items-center gap-1">
                            {col}
                            {sortColumn === col && (
                              <span className="text-foreground">
                                {sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayData.map((row, i) => (
                      <tr 
                        key={i} 
                        className={`border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors ${
                          i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                        }`}
                      >
                        {columns.map((col) => (
                          <td key={col} className="px-4 py-3 whitespace-nowrap">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
