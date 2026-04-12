import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Table as TableIcon, BarChart3, ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import type { ChartConfig, ChartCustomizeOptions } from '../lib/api';
import { useDataStore } from '../stores/useDataStore';

interface ChartDetailModalProps {
  chart: ChartConfig;
  isOpen: boolean;
  onClose: () => void;
  panelId?: string;
  initialOptions?: ChartCustomizeOptions;
}

type SortDirection = 'asc' | 'desc' | null;

export function ChartDetailModal({ chart, isOpen, onClose, panelId, initialOptions }: ChartDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'chart' | 'data' | 'customize'>('chart');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [options, setOptions] = useState<ChartCustomizeOptions>(initialOptions || {});
  const updatePanelOptions = useDataStore(state => state.updatePanelOptions);

  const handleOptionChange = (newOptions: Partial<ChartCustomizeOptions>) => {
    const updated = { ...options, ...newOptions };
    setOptions(updated);
    if (panelId) {
      updatePanelOptions(panelId, updated);
    }
  };

  const handleReset = () => {
    setOptions({});
    if (panelId) {
      updatePanelOptions(panelId, {});
    }
  };

  const PRESET_COLORS = [
    '#f97066', '#f59e0b', '#14b8a6', '#38bdf8', '#8b5cf6', '#ec4899',
    '#22c55e', '#06b6d4', '#a855f7', '#f43f5e', '#eab308', '#64748b'
  ];

  const [expandedSections, setExpandedSections] = useState({
    colors: true,
    dimensions: true,
    display: true,
    specific: true
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  const renderCustomizeTab = () => {
    const isLineArea = ['line', 'area', 'composed'].includes(chart.chart_type);
    const isBar = ['bar', 'groupedBar', 'stackedBar', 'histogram', 'waterfall'].includes(chart.chart_type);
    const isPieDonut = ['pie', 'donut'].includes(chart.chart_type);
    const isRadar = chart.chart_type === 'radar';

    return (
      <div className="flex flex-col gap-4 pb-2">
        {/* Colors Section */}
        <div className="border border-border/60 rounded-xl overflow-hidden">
          <button 
            onClick={() => toggleSection('colors')}
            className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold text-sm text-foreground">Colors</h3>
            {expandedSections.colors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.colors && (
            <div className="p-4 flex flex-col gap-4 bg-card">
              {chart.config.series.map((s, i) => (
                <div key={s.dataKey} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{s.dataKey}</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={options.seriesColors?.[s.dataKey] || options.colors?.[i] || s.color || PRESET_COLORS[i % PRESET_COLORS.length]}
                      onChange={(e) => handleOptionChange({ 
                        seriesColors: { ...options.seriesColors, [s.dataKey]: e.target.value } 
                      })}
                      className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    className="w-6 h-6 rounded-full border border-border/60 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      const newColors = [...(options.colors || PRESET_COLORS)];
                      newColors[0] = color;
                      handleOptionChange({ colors: newColors });
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dimensions Section */}
        <div className="border border-border/60 rounded-xl overflow-hidden">
          <button 
            onClick={() => toggleSection('dimensions')}
            className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold text-sm text-foreground">Dimensions</h3>
            {expandedSections.dimensions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.dimensions && (
            <div className="p-4 flex flex-col gap-4 bg-card">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <label className="text-sm text-muted-foreground">Height</label>
                  <span className="text-sm text-foreground">{options.height || 500}px</span>
                </div>
                <input 
                  type="range" 
                  min="200" max="800" step="50" 
                  value={options.height || 500}
                  onChange={(e) => handleOptionChange({ height: parseInt(e.target.value) })}
                  className="w-full accent-dm-coral"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Top Margin</label>
                  <input type="number" value={options.margins?.top ?? 20} onChange={(e) => handleOptionChange({ margins: { ...options.margins, top: parseInt(e.target.value) } })} className="bg-muted border border-border rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Right Margin</label>
                  <input type="number" value={options.margins?.right ?? 30} onChange={(e) => handleOptionChange({ margins: { ...options.margins, right: parseInt(e.target.value) } })} className="bg-muted border border-border rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Bottom Margin</label>
                  <input type="number" value={options.margins?.bottom ?? 5} onChange={(e) => handleOptionChange({ margins: { ...options.margins, bottom: parseInt(e.target.value) } })} className="bg-muted border border-border rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Left Margin</label>
                  <input type="number" value={options.margins?.left ?? 20} onChange={(e) => handleOptionChange({ margins: { ...options.margins, left: parseInt(e.target.value) } })} className="bg-muted border border-border rounded px-2 py-1 text-sm" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Display Section */}
        <div className="border border-border/60 rounded-xl overflow-hidden">
          <button 
            onClick={() => toggleSection('display')}
            className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold text-sm text-foreground">Display</h3>
            {expandedSections.display ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandedSections.display && (
            <div className="p-4 flex flex-col gap-4 bg-card">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-muted-foreground">Show Grid</span>
                <input type="checkbox" checked={options.showGrid ?? true} onChange={(e) => handleOptionChange({ showGrid: e.target.checked })} className="accent-dm-teal w-4 h-4" />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-muted-foreground">Show Legend</span>
                <input type="checkbox" checked={options.showLegend ?? true} onChange={(e) => handleOptionChange({ showLegend: e.target.checked })} className="accent-dm-teal w-4 h-4" />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-muted-foreground">Show Tooltip</span>
                <input type="checkbox" checked={options.showTooltip ?? true} onChange={(e) => handleOptionChange({ showTooltip: e.target.checked })} className="accent-dm-teal w-4 h-4" />
              </label>
            </div>
          )}
        </div>

        {/* Chart-Specific Section */}
        {(isLineArea || isBar || isPieDonut || isRadar) && (
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <button 
              onClick={() => toggleSection('specific')}
              className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <h3 className="font-semibold text-sm text-foreground">Chart Specific</h3>
              {expandedSections.specific ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.specific && (
              <div className="p-4 flex flex-col gap-4 bg-card">
                {isLineArea && (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <label className="text-sm text-muted-foreground">Stroke Width</label>
                        <span className="text-sm text-foreground">{options.strokeWidth ?? 2.5}</span>
                      </div>
                      <input type="range" min="1" max="5" step="0.5" value={options.strokeWidth ?? 2.5} onChange={(e) => handleOptionChange({ strokeWidth: parseFloat(e.target.value) })} className="w-full accent-dm-coral" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <label className="text-sm text-muted-foreground">Dot Size</label>
                        <span className="text-sm text-foreground">{options.dotSize ?? 3.5}</span>
                      </div>
                      <input type="range" min="0" max="8" step="0.5" value={options.dotSize ?? 3.5} onChange={(e) => handleOptionChange({ dotSize: parseFloat(e.target.value) })} className="w-full accent-dm-coral" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <label className="text-sm text-muted-foreground">Area Opacity</label>
                        <span className="text-sm text-foreground">{options.areaOpacity ?? 0.15}</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={options.areaOpacity ?? 0.15} onChange={(e) => handleOptionChange({ areaOpacity: parseFloat(e.target.value) })} className="w-full accent-dm-coral" />
                    </div>
                  </>
                )}
                {isBar && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <label className="text-sm text-muted-foreground">Bar Radius</label>
                      <span className="text-sm text-foreground">{options.barRadius ?? 6}px</span>
                    </div>
                    <input type="range" min="0" max="12" step="1" value={options.barRadius ?? 6} onChange={(e) => handleOptionChange({ barRadius: parseInt(e.target.value) })} className="w-full accent-dm-coral" />
                  </div>
                )}
                {isPieDonut && (
                  <>
                    {chart.chart_type === 'donut' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between">
                          <label className="text-sm text-muted-foreground">Inner Radius</label>
                          <span className="text-sm text-foreground">{options.innerRadius ?? 20}%</span>
                        </div>
                        <input type="range" min="10" max="45" step="1" value={options.innerRadius ?? 20} onChange={(e) => handleOptionChange({ innerRadius: parseInt(e.target.value) })} className="w-full accent-dm-coral" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <label className="text-sm text-muted-foreground">Outer Radius</label>
                        <span className="text-sm text-foreground">{options.outerRadius ?? 33}%</span>
                      </div>
                      <input type="range" min="20" max="50" step="1" value={options.outerRadius ?? 33} onChange={(e) => handleOptionChange({ outerRadius: parseInt(e.target.value) })} className="w-full accent-dm-coral" />
                    </div>
                    {chart.chart_type === 'donut' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between">
                          <label className="text-sm text-muted-foreground">Padding Angle</label>
                          <span className="text-sm text-foreground">{options.paddingAngle ?? 2}°</span>
                        </div>
                        <input type="range" min="0" max="10" step="1" value={options.paddingAngle ?? 2} onChange={(e) => handleOptionChange({ paddingAngle: parseInt(e.target.value) })} className="w-full accent-dm-coral" />
                      </div>
                    )}
                  </>
                )}
                {isRadar && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <label className="text-sm text-muted-foreground">Fill Opacity</label>
                      <span className="text-sm text-foreground">{options.radarOpacity ?? 0.25}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={options.radarOpacity ?? 0.25} onChange={(e) => handleOptionChange({ radarOpacity: parseFloat(e.target.value) })} className="w-full accent-dm-coral" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reset Button */}
        <button 
          onClick={handleReset}
          className="w-full py-2 px-4 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-colors text-sm font-medium"
        >
          Reset to Defaults
        </button>
      </div>
    );
  };

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
      <div className="relative w-full max-w-full sm:max-w-5xl lg:max-w-6xl max-h-[90vh] bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col animate-scale-in overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <h2 className="font-display font-bold text-base sm:text-xl text-foreground truncate pr-4">
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
        <div className="flex items-center gap-2 px-4 pt-4 border-b border-border/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab('chart')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'data'
                ? 'border-dm-teal text-dm-teal'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            Data Table
          </button>
          <button
            onClick={() => setActiveTab('customize')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'customize'
                ? 'border-dm-violet text-dm-violet'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Customize
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {activeTab === 'customize' && (
            <div className="w-full md:w-72 lg:w-80 shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r border-border/60 p-4 md:p-6 bg-muted/10
                            max-h-[40vh] md:max-h-none md:overflow-y-auto"
                 style={{ minHeight: 0 }}>
              {renderCustomizeTab()}
            </div>
          )}
          <div className="flex-1 min-w-0 min-h-0 overflow-auto p-4 md:p-6">
            {activeTab === 'chart' || activeTab === 'customize' ? (
              <div className="w-full h-full min-h-[250px] md:min-h-[400px] flex items-center justify-center">
                <ChartRenderer config={chart} height={options.height || 500} options={options} />
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
    </div>
  );

  return createPortal(modalContent, document.body);
}
