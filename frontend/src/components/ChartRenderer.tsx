import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ChartConfig } from '../lib/api';

const DEFAULT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

interface ChartRendererProps {
  config: ChartConfig;
  height?: number;
}

export function ChartRenderer({ config, height = 400 }: ChartRendererProps) {
  const { chart_type, title, data, config: chartConfig } = config;

  if (!data || !data.length) {
    return <p className="text-stone-400 text-sm">No data to display</p>;
  }

  const renderChart = () => {
    switch (chart_type) {
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '13px' }}
            />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
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
            <Tooltip />
            <Legend />
          </PieChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            {chartConfig.series.map((s, i) => (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} fillOpacity={0.2} />
            ))}
          </AreaChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid stroke="#e7e5e4" />
            <XAxis type="number" dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis type="number" dataKey={chartConfig.series[0]?.dataKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            <Scatter data={data} fill={chartConfig.series[0]?.color || DEFAULT_COLORS[0]} />
          </ScatterChart>
        );

      case 'composed':
        return (
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey={chartConfig.xAxisKey} tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <YAxis tick={{ fontSize: 12 }} stroke="#a8a29e" />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4' }} />
            <Legend />
            {chartConfig.series.map((s, i) => {
              const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
              switch (s.type) {
                case 'line': return <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} />;
                case 'area': return <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} stroke={color} fill={color} fillOpacity={0.2} />;
                default: return <Bar key={s.dataKey} dataKey={s.dataKey} fill={color} radius={[4, 4, 0, 0]} />;
              }
            })}
          </ComposedChart>
        );

      default:
        return <p className="text-stone-400">Unsupported chart type: {chart_type}</p>;
    }
  };

  return (
    <div className="w-full">
      {title && <h3 className="text-sm font-medium text-stone-700 mb-3">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
