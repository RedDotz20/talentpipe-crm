import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export const asyncStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No tenant context');
  return ctx.tenantId;
}

export function getSchema(): string {
  return `tenant_${getTenantId()}`;
}

export function getCurrentUser(): TenantContext {
  const ctx = asyncStorage.getStore();
  if (!ctx) throw new Error('No tenant context');
  return ctx;
}
