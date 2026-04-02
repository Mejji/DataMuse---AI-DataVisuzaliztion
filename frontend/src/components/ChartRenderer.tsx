import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ChartConfig } from '../lib/api';
import { useTheme } from '../hooks/useTheme';

// Warm, distinctive palette matching the DataMuse brand
const DEFAULT_COLORS = ['#f97066', '#f59e0b', '#14b8a6', '#38bdf8', '#8b5cf6', '#ec4899'];

interface ChartRendererProps {
  config: ChartConfig;
  height?: number;
}

const tooltipStyle = {
  borderRadius: '12px',
  border: '1px solid #ebe7e3',
  fontSize: '13px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  fontFamily: '"Outfit Variable", "Outfit", sans-serif',
};

const axisStyle = { fontSize: 11, fontFamily: '"Nunito Sans Variable", "Nunito Sans", sans-serif' };

export function ChartRenderer({ config, height = 400 }: ChartRendererProps) {
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

  const renderChart = () => {
    switch (chart_type) {
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            <Tooltip contentStyle={dynamicTooltipStyle} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} radius={[6, 6, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            <Tooltip contentStyle={dynamicTooltipStyle} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 2 }} />
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
              outerRadius={height / 3}
              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={dynamicTooltipStyle} />
            <Legend />
          </PieChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            <Tooltip contentStyle={dynamicTooltipStyle} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fillOpacity={0.15} />
            ))}
          </AreaChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid stroke={gridStroke} />
            <XAxis type="number" dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis type="number" dataKey={chartConfig.series[0]?.dataKey} tick={axisStyle} stroke={axisStroke} />
            <Tooltip contentStyle={dynamicTooltipStyle} />
            <Legend />
            <Scatter data={data} fill={chartConfig.series[0]?.color || DEFAULT_COLORS[0]} />
          </ScatterChart>
        );

      case 'composed':
        return (
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={chartConfig.xAxisKey} tick={axisStyle} stroke={axisStroke} />
            <YAxis tick={axisStyle} stroke={axisStroke} />
            <Tooltip contentStyle={dynamicTooltipStyle} />
            <Legend />
            {chartConfig.series.map((s, i) => {
              const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
              switch (s.type) {
                case 'line': return <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} strokeWidth={2.5} />;
                case 'area': return <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} fill={color} fillOpacity={0.15} />;
                default: return <Bar key={s.dataKey} dataKey={s.dataKey} fill={color} radius={[6, 6, 0, 0]} />;
              }
            })}
          </ComposedChart>
        );

      default:
        return <p className="text-muted-foreground">Unsupported chart type: {chart_type}</p>;
    }
  };

  return (
    <div className="w-full">
      {title && <h3 className="text-sm font-display font-semibold text-foreground mb-3 truncate" title={title}>{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
