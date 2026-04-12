import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ArrowUpDown, ArrowUp, ArrowDown, EyeOff, 
  Filter, GripVertical, X, Search, Columns3 
} from 'lucide-react';
import type { TableConfig } from '../lib/api';
import { useTheme } from '../hooks/useTheme';

interface TableRendererProps {
  config: TableConfig;
  maxHeight?: number;
}

type SortDirection = 'asc' | 'desc' | null;

interface FilterState {
  text: string;
  min: string;
  max: string;
}

export function TableRenderer({ config, maxHeight = 400 }: TableRendererProps) {
  useTheme();
  const { title, columns: initialColumns, rows, row_count, total_rows } = config;

  // State
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(initialColumns.map(c => c.key))
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    initialColumns.map(c => c.key)
  );
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection }>({
    key: '',
    direction: null
  });
  const [filters, setFilters] = useState<Record<string, FilterState>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const columnToggleRef = useRef<HTMLDivElement>(null);

  // Close column toggle on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(event.target as Node)) {
        setShowColumnToggle(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Derived state
  const activeColumns = useMemo(() => {
    return columnOrder
      .filter(key => visibleColumns.has(key))
      .map(key => initialColumns.find(c => c.key === key)!)
      .filter(Boolean);
  }, [columnOrder, visibleColumns, initialColumns]);

  const filteredAndSortedRows = useMemo(() => {
    if (!rows) return [];

    let result = [...rows];

    // Apply filters
    Object.entries(filters).forEach(([key, filter]) => {
      const col = initialColumns.find(c => c.key === key);
      if (!col) return;

      result = result.filter(row => {
        const val = row[key];

        if (col.type === 'number') {
          if (filter.min === '' && filter.max === '') return true;
          if (val == null) return false;
          const numVal = Number(val);
          if (filter.min !== '' && numVal < Number(filter.min)) return false;
          if (filter.max !== '' && numVal > Number(filter.max)) return false;
          return true;
        } else {
          if (!filter.text) return true;
          if (val == null) return false;
          return String(val).toLowerCase().includes(filter.text.toLowerCase());
        }
      });
    });

    // Apply sorting
    if (sortConfig.direction && sortConfig.key) {
      const col = initialColumns.find(c => c.key === sortConfig.key);
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal === bVal) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        let comparison = 0;
        if (col?.type === 'number') {
          comparison = Number(aVal) - Number(bVal);
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [rows, filters, sortConfig, initialColumns]);

  // Handlers
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' };
        if (current.direction === 'desc') return { key, direction: null };
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleFilterChange = (key: string, field: keyof FilterState, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || { text: '', min: '', max: '' }),
        [field]: value
      }
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const toggleColumnVisibility = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.stopPropagation();
    setDraggedColumn(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedColumn || draggedColumn === key) return;

    setColumnOrder(prev => {
      const draggedIdx = prev.indexOf(draggedColumn);
      const targetIdx = prev.indexOf(key);
      
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      
      const next = [...prev];
      next.splice(draggedIdx, 1);
      next.splice(targetIdx, 0, draggedColumn);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
  };

  if (!rows || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  const hasActiveFilters = Object.values(filters).some(f => f.text || f.min || f.max);

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {title ? (
          <h3 className="text-sm font-display font-semibold text-foreground truncate">
            {title}
          </h3>
        ) : <div />}
        
        <div className="flex items-center gap-1.5">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-dm-coral bg-dm-coral/10 hover:bg-dm-coral/20 rounded-lg transition-colors duration-150"
              title="Clear filters"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
              showFilters || hasActiveFilters
                ? 'text-dm-sky bg-dm-sky/10 hover:bg-dm-sky/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="Toggle filters"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filter</span>
          </button>

          <div className="relative" ref={columnToggleRef}>
            <button
              onClick={() => setShowColumnToggle(!showColumnToggle)}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
                showColumnToggle || visibleColumns.size < initialColumns.length
                  ? 'text-dm-violet bg-dm-violet/10 hover:bg-dm-violet/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Columns"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </button>

            {showColumnToggle && (
              <div className="absolute right-0 mt-1 w-48 bg-card border border-border/60 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border/60">
                  Visible Columns
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {initialColumns.map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.key)}
                        onChange={() => toggleColumnVisibility(col.key)}
                        className="rounded border-border/60 text-dm-violet focus:ring-dm-violet/30"
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Table Container */}
      <div 
        className="w-full overflow-auto rounded-xl border border-border/60 bg-card"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {activeColumns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
            <EyeOff className="w-5 h-5 opacity-50" />
            All columns hidden
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0 z-10 shadow-sm">
              <tr>
                {activeColumns.map((col) => (
                  <th 
                    key={col.key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, col.key)}
                    onDragOver={(e) => handleDragOver(e, col.key)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2.5 text-xs font-display font-semibold text-foreground/70 uppercase tracking-wider select-none group cursor-pointer transition-colors duration-150 hover:bg-muted/60 ${
                      draggedColumn === col.key ? 'opacity-50 bg-muted' : ''
                    } ${col.type === 'number' ? 'text-right' : 'text-left'}`}
                  >
                    <div className={`flex items-center gap-1.5 ${col.type === 'number' ? 'justify-end' : 'justify-start'}`}>
                      <GripVertical 
                        className="w-3 h-3 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing transition-opacity" 
                        onClick={(e) => e.stopPropagation()} 
                      />
                      <span className="truncate">{col.label}</span>
                      <span className="w-3.5 h-3.5 flex items-center justify-center text-muted-foreground">
                        {sortConfig.key === col.key ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-dm-sky" /> :
                          sortConfig.direction === 'desc' ? <ArrowDown className="w-3 h-3 text-dm-sky" /> :
                          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />
                        )}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
              {/* Filter Row */}
              {showFilters && (
                <tr className="bg-muted/20 border-t border-border/60">
                  {activeColumns.map((col) => (
                    <th key={`filter-${col.key}`} className="px-3 py-2 font-normal">
                      {col.type === 'number' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            placeholder="Min"
                            value={filters[col.key]?.min || ''}
                            onChange={(e) => handleFilterChange(col.key, 'min', e.target.value)}
                            className="w-full min-w-[60px] px-2 py-1 text-xs bg-background border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-dm-sky/50 text-foreground placeholder:text-muted-foreground/50"
                          />
                          <span className="text-muted-foreground/50">-</span>
                          <input
                            type="number"
                            placeholder="Max"
                            value={filters[col.key]?.max || ''}
                            onChange={(e) => handleFilterChange(col.key, 'max', e.target.value)}
                            className="w-full min-w-[60px] px-2 py-1 text-xs bg-background border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-dm-sky/50 text-foreground placeholder:text-muted-foreground/50"
                          />
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                          <input
                            type="text"
                            placeholder="Filter..."
                            value={filters[col.key]?.text || ''}
                            onChange={(e) => handleFilterChange(col.key, 'text', e.target.value)}
                            className="w-full pl-6 pr-2 py-1 text-xs bg-background border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-dm-sky/50 text-foreground placeholder:text-muted-foreground/50"
                          />
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {filteredAndSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No rows match the current filters
                  </td>
                </tr>
              ) : (
                filteredAndSortedRows.map((row, rowIdx) => (
                  <tr 
                    key={rowIdx}
                    className="even:bg-muted/20 hover:bg-dm-coral/5 transition-colors duration-150 border-b border-border/30 last:border-0"
                  >
                    {activeColumns.map((col) => {
                      const value = row[col.key];
                      const isNumber = col.type === 'number';
                      
                      return (
                        <td 
                          key={col.key}
                          className={`px-3 py-2 ${
                            isNumber ? 'text-right' : 'text-left max-w-[200px] truncate'
                          }`}
                          title={!isNumber && typeof value === 'string' ? value : undefined}
                        >
                          {isNumber && typeof value === 'number' 
                            ? value.toLocaleString() 
                            : value}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 px-1">
        <div>
          Showing {filteredAndSortedRows.length} of {row_count} rows
          {filteredAndSortedRows.length !== row_count && ` (${row_count - filteredAndSortedRows.length} filtered)`}
          {total_rows > row_count && ` (from ${total_rows} total)`}
        </div>
      </div>
    </div>
  );
}
