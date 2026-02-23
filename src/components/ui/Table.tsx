import { type HTMLAttributes } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  /** When sortable, use this to get the sort value (e.g. for computed columns like version) */
  sortValue?: (row: T) => string | number;
}

export interface TableProps<T> extends Omit<HTMLAttributes<HTMLTableElement>, 'children'> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (key: string) => void;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found.',
  onRowClick,
  sortColumn = null,
  sortDirection = null,
  onSort,
  className = '',
  ...props
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className={`w-full text-sm ${className}`} {...props}>
        <thead>
          <tr className="border-b border-surface-border bg-surface-overlay">
            {columns.map((col) => {
              const isSorted = sortColumn === col.key;
              const canSort = col.sortable && onSort;
              return (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${
                    canSort ? 'cursor-pointer select-none hover:text-gray-300 hover:bg-surface-elevated/50 transition-colors' : ''
                  }`}
                  style={{
                    width: col.width,
                    textAlign: col.align ?? 'left',
                  }}
                  onClick={() => canSort && onSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {canSort && isSorted && (sortDirection === 'asc' ? (
                      <ChevronUp className="w-3.5 h-3.5" aria-hidden />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" aria-hidden />
                    ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={
                  onRowClick
                    ? 'cursor-pointer bg-surface-elevated hover:bg-surface-overlay transition-colors duration-200'
                    : 'bg-surface-elevated'
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3 text-gray-200"
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render
                      ? col.render(row)
                      : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
