import type { RunzD1QueryResult } from './runz-tauri';

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function d1ResultToCsv(result: RunzD1QueryResult): string {
  const header = result.columns.map(escapeCsvCell).join(',');
  const body = result.rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
