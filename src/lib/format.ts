export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export function money(n: number, symbol = 'L'): string {
  const v = Math.round(n || 0);
  return `${v.toLocaleString('de-DE')} ${symbol}`;
}
export function num(n: number, d = 2): string {
  return (n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: d });
}
export const pct = (n: number) => `${num(n, 1)} %`;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
