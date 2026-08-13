import { AsyncLocalStorage } from 'async_hooks';

export interface CompanyContext {
  companyId: string;
  userId: string;
  role: string;
}

export const asyncStorage = new AsyncLocalStorage<CompanyContext>();

export function getCompanyId(): string {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No company context');
  return ctx.companyId;
}

export function getSchema(): string {
  const companyId = getCompanyId();
  if (companyId === 'public') return 'public';
  return `company_${companyId}`;
}

export function getCurrentUser(): CompanyContext {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No company context');
  return ctx;
}
