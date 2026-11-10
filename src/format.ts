export function tokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

export function money(n: number): string {
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
