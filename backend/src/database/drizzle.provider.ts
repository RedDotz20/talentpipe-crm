import { Pool } from 'pg';

export const DRIZZLE_PROVIDER = 'DRIZZLE_PROVIDER';

export const drizzleProvider = {
  provide: DRIZZLE_PROVIDER,
  useFactory: () => {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  },
};
