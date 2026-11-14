export interface ParsedRow {
  date: string;
  platform: string;
  fundCode: string;
  type: string;
  amount?: string;
  units: string;
  unitPrice: string;
  fee: string;
  note: string;
  isValid: boolean;
  error?: string;
}

export const DEFAULT_COL_WIDTHS = {
  index: 40,
  date: 115,
  platform: 95,
  fundCode: 340, // 340px default to fit long fund names comfortably
  type: 125,
  amount: 110,
  nav: 140,
  units: 110,
  fee: 85,
  note: 180,
  action: 45,
};

export type ColKey = keyof typeof DEFAULT_COL_WIDTHS;
export type ColWidths = typeof DEFAULT_COL_WIDTHS;

export function getRowAmount(r: ParsedRow): number {
  if (r.amount && !isNaN(parseFloat(r.amount)) && parseFloat(r.amount) > 0) {
    return Math.round(parseFloat(r.amount) * 100) / 100;
  }
  const u = parseFloat(r.units);
  const p = parseFloat(r.unitPrice);
  if (!isNaN(u) && !isNaN(p) && u > 0 && p > 0) {
    return Math.round(u * p * 100) / 100;
  }
  return 0;
}
