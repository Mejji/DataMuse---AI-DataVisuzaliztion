import type { TableConfig } from '../lib/api';
import { useTheme } from '../hooks/useTheme';

interface TableRendererProps {
  config: TableConfig;
  maxHeight?: number;
}

export function TableRenderer({ config, maxHeight = 400 }: TableRendererProps) {
  useTheme();
  const { title, columns, rows, row_count, total_rows } = config;

  if (!rows || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      {title && (
        <h3 className="text-sm font-display font-semibold text-foreground mb-3 truncate">
          {title}
        </h3>
      )}
      
      <div 
        className="w-full overflow-auto rounded-xl border border-border/60"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <table className="w-full text-sm">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr>
              {columns.map((col, idx) => (
                <th 
                  key={idx}
                  className={`px-4 py-2.5 text-xs font-display font-semibold text-foreground/70 uppercase tracking-wider ${
                    col.type === 'number' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr 
                key={rowIdx}
                className="even:bg-muted/20 hover:bg-dm-coral/5 transition-colors duration-150"
              >
                {columns.map((col, colIdx) => {
                  const value = row[col.key];
                  const isNumber = col.type === 'number';
                  
                  return (
                    <td 
                      key={colIdx}
                      className={`px-4 py-2 ${
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
            ))}
          </tbody>
        </table>
      </div>
      
      {total_rows > row_count && (
        <div className="text-xs text-muted-foreground mt-2">
          Showing {row_count} of {total_rows} rows
        </div>
      )}
    </div>
  );
}
