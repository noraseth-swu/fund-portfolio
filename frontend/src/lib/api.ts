export interface HoldingPosition {
  proj_id: string;
  fund_abbr: string;
  fund_name_th?: string;
  platform: string;
  total_units: string;
  avg_cost: string;
  total_cost: string;
  current_nav: string;
  nav_date?: string;
  asset_type?: 'FUND' | 'STOCK' | 'PVD';
  market_value: string;
  unrealized_pl: string;
  unrealized_pl_pct: string;
  realized_pl: string;
  total_dividend: string;
  currency?: string;
  price_foreign?: string;
  avg_cost_foreign?: string;
  exchange_rate?: string;
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
  total_amount?: string;
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
}>): Promise<{ success: boolean; inserted_count: number; skipped_count: number }> {
  const res = await authFetch(`${API_BASE}/transactions/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloads),
  });
  if (!res.ok) throw new Error('Failed to batch import transactions');
  return res.json();
}

export async function updateTransaction(id: string, payload: {
  proj_id: string;
  fund_abbr?: string;
  platform: string;
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  total_amount?: string;
  fee?: string;
  note?: string;
}): Promise<{ success: boolean; message: string; transaction: Transaction }> {
  const res = await authFetch(`${API_BASE}/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update transaction');
  return res.json();
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const res = await authFetch(`${API_BASE}/transactions/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete transaction');
  return true;
}

export async function bulkDeleteTransactions(ids: string[]): Promise<{ success: boolean; deleted_count: number }> {
  const res = await authFetch(`${API_BASE}/transactions/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to bulk delete transactions');
  return res.json();
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

export async function triggerNavSync(): Promise<{ success: boolean; updated_funds_count: number; latest_nav_date?: string }> {
  const res = await authFetch(`${API_BASE}/funds/sync`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to sync NAV');
  return res.json();
}

export interface TokenUsage {
  prompt_tokens: number;
  candidates_tokens: number;
  thoughts_tokens?: number;
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

export interface UserSettings {
  user_id: string;
  gmail_account?: string;
  gmail_app_password?: string;
  dob_day?: string;
  dob_month?: string;
  dob_year_ce?: string;
  dob_year_be?: string;
  national_id_last5?: string;
  custom_pdf_passwords?: string;
  auto_sync_enabled: boolean;
  last_sync_at?: string;
}

export interface EmailTestResult {
  success: boolean;
  message?: string;
  inbox_messages?: number;
  error?: string;
}

export interface EmailSyncResult {
  success: boolean;
  emails_scanned: number;
  attachments_found: number;
  transactions_extracted: number;
  transactions_inserted: number;
  transactions_skipped: number;
  tokens_used?: TokenUsage;
  details: string[];
  error?: string;
}

export async function getUserSettings(): Promise<UserSettings> {
  const res = await authFetch(`${API_BASE}/settings/profile`);
  if (!res.ok) throw new Error('Failed to fetch user settings');
  return res.json();
}

export async function updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const res = await authFetch(`${API_BASE}/settings/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update user settings');
  return res.json();
}

export async function testEmailConnection(payload?: {
  gmail_account?: string;
  gmail_app_password?: string;
}): Promise<EmailTestResult> {
  const res = await authFetch(`${API_BASE}/email/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to test email connection');
  }
  return res.json();
}

export interface EmailSyncProgress {
  is_running: boolean;
  completed?: boolean;
  cancelled?: boolean;
  user_id?: string;
  broker?: string;
  broker_index?: number;
  total_brokers?: number;
  email_index?: number;
  total_emails?: number;
  current_subject?: string;
  current_attachment?: string;
  emails_scanned?: number;
  attachments_found?: number;
  transactions_inserted?: number;
  transactions_skipped?: number;
  tokens_used?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
  status_text?: string;
  recent_logs?: string[];
  log_tail?: string[];
  result?: EmailSyncResult;
  error?: string;
}

export async function startEmailSync(): Promise<{ started: boolean; pid?: number; already_running?: boolean; message?: string }> {
  const res = await authFetch(`${API_BASE}/email/sync/start`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to start email sync');
  }
  return res.json();
}

export async function getEmailSyncStatus(): Promise<EmailSyncProgress> {
  const res = await authFetch(`${API_BASE}/email/sync/status`, {
    method: 'GET',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to get email sync status');
  }
  return res.json();
}

export async function cancelEmailSync(): Promise<{ cancelled: boolean; message?: string }> {
  const res = await authFetch(`${API_BASE}/email/sync/cancel`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to cancel email sync');
  }
  return res.json();
}

export async function syncEmailStatements(): Promise<EmailSyncResult> {
  const res = await authFetch(`${API_BASE}/email/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to sync emails');
  }
  return res.json();
}

export interface SyncCacheStats {
  total_emails: number;
  by_broker: Record<string, number>;
  total_attachments: number;
  pending_count: number;
}

export interface CachedEmailItem {
  message_id: string;
  broker: string;
  subject: string;
  email_date: string;
  tx_count: number;
  created_at?: string;
}

export interface ResetSyncCachePayload {
  broker?: string;
  clear_attachments?: boolean;
  clear_pending?: boolean;
}

export async function getSyncCacheStats(): Promise<SyncCacheStats> {
  const res = await authFetch(`${API_BASE}/email/sync/cache/stats`);
  if (!res.ok) throw new Error('Failed to fetch sync cache stats');
  return res.json();
}

export async function resetSyncCache(payload: ResetSyncCachePayload): Promise<{
  success: boolean;
  deleted_emails: number;
  deleted_attachments: number;
  deleted_pending: number;
}> {
  const res = await authFetch(`${API_BASE}/email/sync/cache/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to reset sync cache');
  return res.json();
}

export async function listCachedEmails(broker?: string, limit = 100): Promise<CachedEmailItem[]> {
  const url = `${API_BASE}/email/sync/cache/list?${broker ? `broker=${encodeURIComponent(broker)}&` : ''}limit=${limit}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to list cached emails');
  return res.json();
}

export async function deleteCachedEmail(messageId: string): Promise<{ deleted: boolean }> {
  const res = await authFetch(`${API_BASE}/email/sync/cache/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete cached email');
  return res.json();
}

export interface EmailBrokerConfig {
  key: string;
  name: string;
  enabled: boolean;
  sender_emails: string[];
  subject_includes: string[];
  subject_excludes: string[];
  extraction_type: string;
  password_patterns: string[];
  ai_prompt_variant: string;
}

export async function getEmailBrokerConfigs(): Promise<EmailBrokerConfig[]> {
  const res = await authFetch(`${API_BASE}/email/sync/brokers`);
  if (!res.ok) throw new Error('Failed to fetch broker configs');
  return res.json();
}

export async function updateEmailBrokerConfigs(configs: EmailBrokerConfig[]): Promise<EmailBrokerConfig[]> {
  const res = await authFetch(`${API_BASE}/email/sync/brokers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configs),
  });
  if (!res.ok) throw new Error('Failed to update broker configs');
  return res.json();
}

export async function resetEmailBrokerConfigs(): Promise<EmailBrokerConfig[]> {
  const res = await authFetch(`${API_BASE}/email/sync/brokers/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset broker configs');
  return res.json();
}

// ==========================================
// Staged Import (Review Before Commit) APIs
// ==========================================

export interface FundSuggestion {
  proj_id: string;
  fund_abbr: string;
  fund_name_th?: string;
  fund_name_en?: string;
  last_nav?: string;
}

export interface PendingTransaction {
  id: string;
  sync_batch_id: string;
  source_file?: string;
  source_email?: string;
  platform: string;
  raw_fund_name: string;
  proj_id?: string;
  fund_abbr?: string;
  fund_name_th?: string;
  fund_name_en?: string;
  match_confidence: 'EXACT' | 'FUZZY' | 'NONE';
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  nav_source: string;
  total_amount: string;
  fee: string;
  note?: string;
  status: string;
  suggestions?: FundSuggestion[];
  created_at?: string;
}

export interface NavByDateResult {
  nav: string;
  nav_date: string;
  nav_source: string;
  is_exact_date: boolean;
}

export async function getPendingTransactions(status = 'PENDING'): Promise<PendingTransaction[]> {
  const res = await authFetch(`${API_BASE}/transactions/pending?status=${encodeURIComponent(status)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to load pending transactions');
  }
  return res.json();
}

export async function getNavByDate(projId: string, date: string, fundAbbr?: string): Promise<NavByDateResult> {
  let url = `${API_BASE}/nav/by-date?proj_id=${encodeURIComponent(projId)}&date=${encodeURIComponent(date)}`;
  if (fundAbbr) {
    url += `&fund_abbr=${encodeURIComponent(fundAbbr)}`;
  }
  const res = await authFetch(url, {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to get NAV by date');
  }
  return res.json();
}

export async function getNavDatesForMonth(
  projId: string,
  month: string,
  fundAbbr?: string
): Promise<{
  proj_id: string;
  month: string;
  nav_dates: Record<string, string>;
}> {
  let url = `${API_BASE}/nav/month-dates?proj_id=${encodeURIComponent(projId)}&month=${encodeURIComponent(month)}`;
  if (fundAbbr) {
    url += `&fund_abbr=${encodeURIComponent(fundAbbr)}`;
  }
  const res = await authFetch(url, {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to get NAV dates for month');
  }
  return res.json();
}

export async function updatePendingTransaction(id: string, patch: Partial<PendingTransaction>): Promise<void> {
  const res = await authFetch(`${API_BASE}/transactions/pending/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error('Failed to update pending transaction');
  }
}

export async function deletePendingTransaction(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/transactions/pending/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete pending transaction');
  }
}

export async function batchDeletePending(ids: string[]): Promise<{ count: number }> {
  const res = await authFetch(`${API_BASE}/transactions/pending/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error('Failed to batch delete pending transactions');
  }
  return res.json();
}

export async function commitPendingTransactions(payload: { ids?: string[]; all?: boolean }): Promise<{ count: number }> {
  const res = await authFetch(`${API_BASE}/transactions/pending/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Failed to commit pending transactions');
  }
  return res.json();
}

export async function createPendingTransaction(payload: {
  platform: string;
  raw_fund_name: string;
  proj_id?: string;
  fund_abbr?: string;
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  total_amount?: string;
  fee?: string;
  note?: string;
}): Promise<{ id: string }> {
  const res = await authFetch(`${API_BASE}/transactions/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Failed to create pending transaction');
  }
  return res.json();
}

export async function createPendingTransactionsBatch(payloads: Array<{
  platform: string;
  raw_fund_name: string;
  proj_id?: string;
  fund_abbr?: string;
  trans_type: string;
  trans_date: string;
  units: string;
  unit_price: string;
  total_amount?: string;
  fee?: string;
  note?: string;
  sync_batch_id?: string;
  source_file?: string;
}>): Promise<{ inserted_count: number; status: string }> {
  const res = await authFetch(`${API_BASE}/transactions/pending/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloads),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to create pending transactions batch');
  }
  return res.json();
}
