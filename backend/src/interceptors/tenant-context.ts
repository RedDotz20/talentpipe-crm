import { AsyncLocalStorage } from 'async_hooks';

export const tenantContext = new AsyncLocalStorage<string | undefined>();

export function getSchema(): string {
  const schemaName = tenantContext.getStore();
  if (!schemaName) {
    throw new Error('No tenant context available');
  }
  return schemaName;
}
