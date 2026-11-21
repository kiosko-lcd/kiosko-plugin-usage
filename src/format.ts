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

/**
 * An amount in its own currency, the way the reader's language writes it:
 * `¥110.00` in simplified Chinese, `CN¥110.00` elsewhere (so it isn't taken
 * for yen or for NT$), `US$42.10` in Taiwan. Never converted. Whole units
 * from 1,000 on, so the figure stays short.
 */
export function currency(n: number, code: string, locale: string): string {
  const digits = Math.abs(n) >= 1000 ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${code}`;
  }
}
