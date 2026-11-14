export interface HoldingPosition {
  proj_id: string;
  fund_abbr: string;
  fund_name_th?: string;
  platform: string;
  total_units: string;
  avg_cost: string;
  total_cost: string;
  current_nav: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_pl_pct: string;
  realized_pl: string;
  total_dividend: string;
}

export interface PlatformSummary {
  platform: string;
  total_cost: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_pl_pct: string;
  realized_pl: string;
  allocation_pct: string;
}

export interface PortfolioSummary {
  total_cost: string;
  market_value: string;
  total_unrealized_pl: string;
  total_unrealized_pl_pct: string;
  total_realized_pl: string;
  total_dividend: string;
  holdings: HoldingPosition[];
  platforms: Record<string, PlatformSummary>;
}

export interface Transaction {
  id: string;
  proj_id: string;
  fund_abbr?: string;
  platform: string;
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  total_amount: string;
  fee: string;
  note?: string;
}

export interface FundSearchResult {
  proj_id: string;
  proj_abbr_name?: string;
  proj_name_th?: string;
  proj_name_en?: string;
  last_nav?: string;
  last_nav_date?: string;
}

export interface BrokerItem {
  code: string;
  name_th: string;
  name_en: string;
  category: string;
}

const API_BASE = '/api';

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (e) {
      console.warn('Could not get Clerk auth token:', e);
    }
  }
  return fetch(url, { ...init, headers });
}

export async function getPortfolio(): Promise<PortfolioSummary> {
  const res = await authFetch(`${API_BASE}/portfolio`);
  if (!res.ok) throw new Error('Failed to fetch portfolio summary');
  return res.json();
}

export async function getTransactions(): Promise<Transaction[]> {
  const res = await authFetch(`${API_BASE}/transactions`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function createTransaction(payload: {
  proj_id: string;
  fund_abbr?: string;
  platform: string;
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  fee?: string;
  note?: string;
}): Promise<Transaction> {
  const res = await authFetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create transaction');
  return res.json();
}

export async function createTransactionsBatch(payloads: Array<{
  proj_id: string;
  fund_abbr?: string;
  platform: string;
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  fee?: string;
  note?: string;
}>): Promise<{ success: boolean; inserted_count: number }> {
  const res = await authFetch(`${API_BASE}/transactions/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloads),
  });
  if (!res.ok) throw new Error('Failed to batch import transactions');
  return res.json();
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const res = await authFetch(`${API_BASE}/transactions/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete transaction');
  return true;
}

export async function searchFunds(q: string): Promise<FundSearchResult[]> {
  const res = await authFetch(`${API_BASE}/funds/search?q=${encodeURIComponent(q)}&limit=15`);
  if (!res.ok) throw new Error('Failed to search funds');
  return res.json();
}

export async function getBrokers(): Promise<BrokerItem[]> {
  const res = await authFetch(`${API_BASE}/brokers`);
  if (!res.ok) throw new Error('Failed to fetch brokers');
  return res.json();
}

export async function triggerNavSync(): Promise<{ success: boolean; updated_funds_count: number }> {
  const res = await authFetch(`${API_BASE}/funds/sync`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to sync NAV');
  return res.json();
}

export interface TokenUsage {
  prompt_tokens: number;
  candidates_tokens: number;
  total_tokens: number;
}

export interface ParsedAiTransaction {
  trans_date: string;
  platform: string;
  fund_abbr: string;
  trans_type: string;
  units: number;
  unit_price: number;
  fee: number;
  note?: string;
}

export async function parseStatementAi(payload: {
  pdf_base64?: string;
  text?: string;
}): Promise<{
  success: boolean;
  count: number;
  transactions: ParsedAiTransaction[];
  usage?: TokenUsage;
}> {
  const res = await authFetch(`${API_BASE}/parse/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to parse statement');
  }
  return res.json();
}
