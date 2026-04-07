import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Treemap, FunnelChart, Funnel, LabelList,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, Rectangle,
} from 'recharts';
import type { ChartConfig, ChartCustomizeOptions } from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import { useMemo } from 'react';

// Warm, distinctive palette matching the DataMuse brand
const DEFAULT_COLORS = ['#f97066', '#f59e0b', '#14b8a6', '#38bdf8', '#8b5cf6', '#ec4899'];

interface ChartRendererProps {
  config: ChartConfig;
  height?: number;
  options?: ChartCustomizeOptions;
}

const tooltipStyle = {
  borderRadius: '12px',
  border: '1px solid #ebe7e3',
  fontSize: '13px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  fontFamily: '"Outfit Variable", "Outfit", sans-serif',
};

const axisStyle = { fontSize: 11, fontFamily: '"Nunito Sans Variable", "Nunito Sans", sans-serif' };

export function ChartRenderer({ config, height = 400, options }: ChartRendererProps) {
  const { chart_type, title, data, config: chartConfig } = config;
  const { theme } = useTheme();

  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#ebe7e3';
  const axisStroke = isDark ? '#64748b' : '#b8b0a8';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#ebe7e3';
  const tooltipColor = isDark ? '#f8fafc' : '#1e293b';

  const dynamicTooltipStyle = {
    ...tooltipStyle,
    backgroundColor: tooltipBg,
    borderColor: tooltipBorder,
    color: tooltipColor,
  };

  if (!data || !data.length) {
    return <p className="text-muted-foreground text-sm">No data to display</p>;
  }

  const { validData, validConfig, validationError } = useMemo(() => {
    if (!chartConfig || !chartConfig.series || chartConfig.series.length === 0) {
      return { validData: data, validConfig: chartConfig, validationError: "No chart configuration" };
    }

    let newData = [...data];
    let newConfig = { ...chartConfig, series: [...chartConfig.series] };
    const dataKeys = newData.length > 0 ? Object.keys(newData[0]) : [];
    
    if (newConfig.xAxisKey && !dataKeys.includes(newConfig.xAxisKey)) {
      const match = dataKeys.find(k => k.toLowerCase() === newConfig.xAxisKey?.toLowerCase());
      if (match) {
        console.warn(`Auto-fixed xAxisKey: '${newConfig.xAxisKey}' -> '${match}'`);
        newConfig.xAxisKey = match;
      }
    }

    let hasValidSeries = false;

    newConfig.series = newConfig.series.map(series => {
      let newSeries = { ...series };
      
      if (newSeries.dataKey && !dataKeys.includes(newSeries.dataKey)) {
        const match = dataKeys.find(k => k.toLowerCase() === newSeries.dataKey.toLowerCase());
        if (match) {
          console.warn(`Auto-fixed series.dataKey: '${newSeries.dataKey}' -> '${match}'`);
          newSeries.dataKey = match;
        }
      }

      if (newSeries.dataKey && dataKeys.includes(newSeries.dataKey)) {
        hasValidSeries = true;
        
        const allNonNumericStrings = newData.every(row => {
          const val = row[newSeries.dataKey];
          return typeof val === 'string' && isNaN(Number(val));
        });

        if (allNonNumericStrings) {
          console.warn(`Auto-converting non-numeric string series '${newSeries.dataKey}' to counts.`);
          const counts: Record<string, number> = {};
          newData.forEach(row => {
            const val = String(row[newSeries.dataKey]);
            counts[val] = (counts[val] || 0) + 1;
          });
          
          newData = Object.entries(counts).map(([key, count]) => ({
            [newConfig.xAxisKey || 'name']: key,
            count: count
          }));
          
          newSeries.dataKey = 'count';
        }
      }

      return newSeries;
    });

    if (!hasValidSeries) {
      return { validData: newData, validConfig: newConfig, validationError: "No valid data keys found for the configured series." };
    }

    return { validData: newData, validConfig: newConfig, validationError: null };
  }, [data, chartConfig]);

  if (validationError) {
    return <p className="text-muted-foreground text-sm">{validationError}</p>;
  }

  const renderChart = () => {
    if (!validConfig) return null;
    const data = validData;
    const chartConfig = validConfig;

    const getColor = (index: number, dataKey?: string) => {
      if (dataKey && options?.seriesColors?.[dataKey]) return options.seriesColors[dataKey];
      if (options?.colors?.[index]) return options.colors[index];
      if (dataKey) {
        const series = chartConfig.series.find(s => s.dataKey === dataKey);
        if (series?.color) return series.color;
      }
      return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    };

    const finalHeight = options?.height ?? height;
    const margins = options?.margins ?? { top: 20, right: 30, left: 20, bottom: 5 };
    const showGrid = options?.showGrid ?? true;
    const showLegend = options?.showLegend ?? true;
    const showTooltip = options?.showTooltip ?? true;
    const strokeWidth = options?.strokeWidth ?? 2.5;
    const dotSize = options?.dotSize ?? 3.5;
    const areaOpacity = options?.areaOpacity ?? 0.15;
    const barRadius = options?.barRadius ?? 6;
    const paddingAngle = options?.paddingAngle ?? 2;
    const radarOpacity = options?.radarOpacity ?? 0.25;

    switch (chart_type) {
      case 'bar':
        return (
          <BarChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            {chartConfig.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={getColor(i, s.dataKey)} radius={[barRadius, barRadius, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            {chartConfig.series.map((s, i) => (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={getColor(i, s.dataKey)} strokeWidth={strokeWidth} dot={{ r: dotSize, strokeWidth: 2 }} />
            ))}
          </LineChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={chartConfig.series[0]?.dataKey || 'value'}
              nameKey={chartConfig.xAxisKey}
              cx="50%"
              cy="50%"
              outerRadius={options?.outerRadius ? `${options.outerRadius}%` : finalHeight / 3}
              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={getColor(i)} />
              ))}
            </Pie>
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
          </PieChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            {chartConfig.series.map((s, i) => (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={getColor(i, s.dataKey)} fill={getColor(i, s.dataKey)} fillOpacity={areaOpacity} />
            ))}
          </AreaChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={margins}>
            {showGrid && <CartesianGrid stroke={gridStroke} />}
            <XAxis type="number" dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis type="number" dataKey={chartConfig.series[0]?.dataKey} tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            <Scatter data={data} fill={getColor(0, chartConfig.series[0]?.dataKey)} />
          </ScatterChart>
        );

      case 'composed':
        return (
          <ComposedChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            {chartConfig.series.map((s, i) => {
              const color = getColor(i, s.dataKey);
              switch (s.type) {
                case 'line': return <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} strokeWidth={strokeWidth} />;
                case 'area': return <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} fill={color} fillOpacity={areaOpacity} />;
                default: return <Bar key={s.dataKey} dataKey={s.dataKey} fill={color} radius={[barRadius, barRadius, 0, 0]} />;
              }
            })}
          </ComposedChart>
        );

      case 'treemap':
        return (
          <Treemap
            data={data}
            dataKey="size"
            nameKey="name"
            aspectRatio={4 / 3}
            stroke={gridStroke}
            content={({ x, y, width, height, name, value, index }: any) => {
              if (width < 40 || height < 30) return null;
              const color = getColor(index ?? 0);
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill={color} stroke={gridStroke} strokeWidth={2} rx={4} />
                  {width > 60 && height > 40 && (
                    <>
                      <text x={x + width / 2} y={y + height / 2 - 8} textAnchor="middle" fill="#fff" fontSize={12} fontFamily='"Outfit Variable", sans-serif' fontWeight={600}>
                        {String(name).length > 12 ? String(name).slice(0, 12) + '…' : name}
                      </text>
                      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={11} fontFamily='"Nunito Sans Variable", sans-serif'>
                        {typeof value === 'number' ? value.toLocaleString() : value}
                      </text>
                    </>
                  )}
                </g>
              );
            }}
          />
        );

      case 'funnel':
        return (
          <FunnelChart>
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            <Funnel dataKey="value" data={data} isAnimationActive>
              {data.map((_, i) => (
                <Cell key={i} fill={getColor(i)} />
              ))}
              <LabelList position="right" fill={isDark ? '#f8fafc' : '#1e293b'} stroke="none" dataKey="name" fontSize={12} fontFamily='"Nunito Sans Variable", sans-serif' />
            </Funnel>
          </FunnelChart>
        );

      case 'radar':
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            {showGrid && <PolarGrid stroke={gridStroke} />}
            <PolarAngleAxis dataKey={chartConfig.xAxisKey || 'subject'} tick={axisStyle} stroke={axisStroke} />
            <PolarRadiusAxis tick={axisStyle} stroke={axisStroke} />
            {chartConfig.series.map((s, i) => (
              <Radar key={s.dataKey} name={s.dataKey} dataKey={s.dataKey} stroke={getColor(i, s.dataKey)} fill={getColor(i, s.dataKey)} fillOpacity={radarOpacity} />
            ))}
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
          </RadarChart>
        );

      case 'radialBar':
        return (
          <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" barSize={18} data={data}>
            <RadialBar background dataKey={chartConfig.series[0]?.dataKey || 'value'} cornerRadius={8} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" formatter={(value: string) => <span style={{ color: isDark ? '#f8fafc' : '#1e293b', fontSize: 12, fontFamily: '"Nunito Sans Variable", sans-serif' }}>{value}</span>} />}
          </RadialBarChart>
        );

      case 'histogram': {
        // If binCount is provided, we might need to re-bin the data, but Recharts BarChart doesn't do binning natively.
        // The data is already binned by the backend. We can't easily change binCount on the frontend without raw data.
        // We will just apply the visual options.
        return (
          <BarChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey || 'bin'} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            <Bar dataKey={chartConfig.series[0]?.dataKey || 'count'} fill={getColor(0, chartConfig.series[0]?.dataKey)} radius={[barRadius, barRadius, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={getColor(i, chartConfig.series[0]?.dataKey)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        );
      }

      case 'groupedBar':
        return (
          <BarChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            {chartConfig.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={getColor(i, s.dataKey)} radius={[barRadius, barRadius, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'stackedBar':
        return (
          <BarChart data={data} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
            {chartConfig.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} stackId="a" fill={getColor(i, s.dataKey)} radius={i === chartConfig.series.length - 1 ? [barRadius, barRadius, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'donut':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={chartConfig.series[0]?.dataKey || 'value'}
              nameKey={chartConfig.xAxisKey || 'name'}
              cx="50%"
              cy="50%"
              innerRadius={options?.innerRadius ? `${options.innerRadius}%` : finalHeight / 5}
              outerRadius={options?.outerRadius ? `${options.outerRadius}%` : finalHeight / 3}
              paddingAngle={paddingAngle}
              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={getColor(i)} />
              ))}
            </Pie>
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} />}
            {showLegend && <Legend />}
          </PieChart>
        );

      case 'bubble':
        return (
          <ScatterChart margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis type="number" dataKey={chartConfig.xAxisKey || 'x'} tick={axisStyle} stroke={axisStroke} name={chartConfig.xAxisKey || 'x'} />
            <YAxis type="number" dataKey={chartConfig.series[0]?.dataKey || 'y'} tick={axisStyle} stroke={axisStroke} name={chartConfig.series[0]?.dataKey || 'y'} />
            <ZAxis type="number" dataKey={chartConfig.series[1]?.dataKey || 'z'} range={[40, 400]} name={chartConfig.series[1]?.dataKey || 'z'} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} cursor={{ strokeDasharray: '3 3' }} />}
            {showLegend && <Legend />}
            <Scatter data={data} fill={getColor(0, chartConfig.series[0]?.dataKey)} fillOpacity={0.6} />
          </ScatterChart>
        );

      case 'waterfall': {
        const waterfallData = data.map((d: any) => ({
          ...d,
          _range: [d.start ?? 0, d.end ?? d.value ?? 0],
        }));
        return (
          <BarChart data={waterfallData} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey || 'name'} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} formatter={(value: any) => {
              if (Array.isArray(value)) return [value[1] - value[0], 'Change'];
              return [value, 'Value'];
            }} />}
            <Bar dataKey="_range" fill={getColor(2)} radius={[barRadius, barRadius, 0, 0]}
              shape={(props: any) => {
                const { x, y, width, height: h, payload } = props;
                const val = (payload.end ?? payload.value ?? 0) - (payload.start ?? 0);
                const fill = payload.isTotal ? getColor(4) : val >= 0 ? getColor(2) : getColor(0);
                return <Rectangle x={x} y={y} width={width} height={h} fill={fill} radius={[barRadius, barRadius, 0, 0]} />;
              }}
            />
          </BarChart>
        );
      }

      case 'boxPlot': {
        const boxData = data.map((d: any) => ({
          ...d,
          _whiskerLow: [d.min, d.q1],
          _box: [d.q1, d.q3],
          _whiskerHigh: [d.q3, d.max],
        }));
        return (
          <BarChart data={boxData} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey || 'category'} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle} formatter={(value: any, name: string) => {
              if (name === 'Whisker' || name === 'Upper') return [null, null];
              const entry = boxData.find(() => true);
              if (!entry) return [value, name];
              return [value, name];
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div style={dynamicTooltipStyle} className="p-2">
                  <p className="font-semibold">{d.category || d[chartConfig.xAxisKey || 'category']}</p>
                  <p>Max: {d.max}</p>
                  <p>Q3: {d.q3}</p>
                  <p>Median: {d.median}</p>
                  <p>Q1: {d.q1}</p>
                  <p>Min: {d.min}</p>
                </div>
              );
            }} />}
            <Bar dataKey="_whiskerLow" fill="transparent" stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={1}
              shape={(props: any) => {
                const { x, y, width, height: h } = props;
                const cx = x + width / 2;
                return (
                  <g>
                    <line x1={cx} y1={y} x2={cx} y2={y + h} stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={1} strokeDasharray="4 2" />
                    <line x1={x + width * 0.25} y1={y} x2={x + width * 0.75} y2={y} stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={2} />
                  </g>
                );
              }}
            />
            <Bar dataKey="_box" fill={getColor(3)} fillOpacity={0.7} stroke={getColor(3)} strokeWidth={1} radius={[4, 4, 4, 4]}
              shape={(props: any) => {
                const { x, y, width, height: h, payload } = props;
                const medianY = h > 0 && payload._box ? y + h * ((payload.q3 - payload.median) / (payload.q3 - payload.q1)) : y + h / 2;
                return (
                  <g>
                    <Rectangle x={x} y={y} width={width} height={h} fill={getColor(3)} fillOpacity={0.7} stroke={getColor(3)} strokeWidth={1} radius={[4, 4, 4, 4]} />
                    <line x1={x} y1={medianY} x2={x + width} y2={medianY} stroke={getColor(0)} strokeWidth={2.5} />
                  </g>
                );
              }}
            />
            <Bar dataKey="_whiskerHigh" fill="transparent" stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={1}
              shape={(props: any) => {
                const { x, y, width, height: h } = props;
                const cx = x + width / 2;
                return (
                  <g>
                    <line x1={cx} y1={y} x2={cx} y2={y + h} stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={1} strokeDasharray="4 2" />
                    <line x1={x + width * 0.25} y1={y + h} x2={x + width * 0.75} y2={y + h} stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth={2} />
                  </g>
                );
              }}
            />
          </BarChart>
        );
      }

      case 'heatmap': {
        const xLabels = [...new Set(data.map((d: any) => d.x))];
        const yLabels = [...new Set(data.map((d: any) => d.y))];
        const values = data.map((d: any) => d.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const cellW = Math.max(30, (finalHeight * 1.4) / xLabels.length);
        const cellH = Math.max(24, (finalHeight - 60) / yLabels.length);
        const getHeatmapColor = (v: number) => {
          const t = maxVal === minVal ? 0.5 : (v - minVal) / (maxVal - minVal);
          const r = Math.round(249 * t + 56 * (1 - t));
          const g = Math.round(112 * t + 189 * (1 - t));
          const b = Math.round(102 * t + 237 * (1 - t));
          return `rgb(${r},${g},${b})`;
        };
        const totalW = xLabels.length * cellW + 60;
        return (
          <svg width="100%" height={finalHeight} viewBox={`0 0 ${totalW} ${yLabels.length * cellH + 60}`} style={{ maxWidth: '100%' }}>
            {data.map((d: any, i: number) => {
              const xi = xLabels.indexOf(d.x);
              const yi = yLabels.indexOf(d.y);
              return (
                <g key={i}>
                  <rect x={60 + xi * cellW} y={10 + yi * cellH} width={cellW - 2} height={cellH - 2} fill={getHeatmapColor(d.value)} rx={3} />
                  {cellW > 35 && cellH > 20 && (
                    <text x={60 + xi * cellW + cellW / 2} y={10 + yi * cellH + cellH / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={((d.value - minVal) / (maxVal - minVal || 1)) > 0.5 ? '#fff' : '#1e293b'} fontFamily='"Nunito Sans Variable", sans-serif'>
                      {typeof d.value === 'number' ? d.value.toFixed(1) : d.value}
                    </text>
                  )}
                </g>
              );
            })}
            {yLabels.map((label, i) => (
              <text key={`y-${i}`} x={55} y={10 + i * cellH + cellH / 2} textAnchor="end" dominantBaseline="central" fontSize={10} fill={isDark ? '#94a3b8' : '#64748b'} fontFamily='"Nunito Sans Variable", sans-serif'>
                {String(label).length > 10 ? String(label).slice(0, 10) + '…' : String(label)}
              </text>
            ))}
            {xLabels.map((label, i) => (
              <text key={`x-${i}`} x={60 + i * cellW + cellW / 2} y={yLabels.length * cellH + 30} textAnchor="middle" fontSize={10} fill={isDark ? '#94a3b8' : '#64748b'} fontFamily='"Nunito Sans Variable", sans-serif' transform={`rotate(-45, ${60 + i * cellW + cellW / 2}, ${yLabels.length * cellH + 30})`}>
                {String(label).length > 10 ? String(label).slice(0, 10) + '…' : String(label)}
              </text>
            ))}
          </svg>
        );
      }

      case 'candlestick': {
        const candleWidth = Math.max(6, Math.min(20, (finalHeight * 1.2) / data.length));
        const candleData = data.map((d: any) => ({ ...d, _wickRange: [d.low, d.high] }));
        return (
          <ComposedChart data={candleData} margin={margins}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />}
            <XAxis dataKey={chartConfig.xAxisKey || 'date'} tick={axisStyle} stroke={axisStroke} />
            <YAxis domain={['auto', 'auto']} tick={axisStyle} stroke={axisStroke} />
            {showTooltip && <Tooltip contentStyle={dynamicTooltipStyle}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div style={dynamicTooltipStyle} className="p-2">
                    <p className="font-semibold">{d[chartConfig.xAxisKey || 'date']}</p>
                    <p>Open: {d.open}</p>
                    <p>High: {d.high}</p>
                    <p>Low: {d.low}</p>
                    <p>Close: {d.close}</p>
                  </div>
                );
              }}
            />}
            <Bar dataKey="_wickRange" barSize={2} fill="transparent"
              shape={(props: any) => {
                const { x, width, payload } = props;
                const yScale = props.background ? undefined : props;
                if (!payload) return null;
                const bullish = payload.close >= payload.open;
                const color = bullish ? getColor(2) : getColor(0);
                const cx = x + width / 2;
                const yHigh = props.y;
                const yLow = props.y + props.height;
                const bodyTop = bullish ? payload.close : payload.open;
                const bodyBot = bullish ? payload.open : payload.close;
                // We need to map values to pixel positions - use linear interpolation from wick
                const totalRange = payload.high - payload.low;
                const pxPerUnit = totalRange > 0 ? props.height / totalRange : 0;
                const bodyTopPx = yHigh + (payload.high - bodyTop) * pxPerUnit;
                const bodyBotPx = yHigh + (payload.high - bodyBot) * pxPerUnit;
                return (
                  <g>
                    <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1.5} />
                    <rect x={cx - candleWidth / 2} y={bodyTopPx} width={candleWidth} height={Math.max(1, bodyBotPx - bodyTopPx)} fill={bullish ? color : color} stroke={color} strokeWidth={1} rx={1} />
                  </g>
                );
              }}
            />
          </ComposedChart>
        );
      }

      default:
        return <p className="text-muted-foreground">Unsupported chart type: {chart_type}</p>;
    }
  };

  const finalHeight = options?.height ?? height;

  return (
    <div className="w-full">
      {title && <h3 className="text-sm font-display font-semibold text-foreground mb-3 truncate" title={title}>{title}</h3>}
      <ResponsiveContainer width="100%" height={finalHeight}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
