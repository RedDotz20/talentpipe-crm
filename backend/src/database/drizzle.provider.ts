import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

export const DRIZZLE_PROVIDER = 'DRIZZLE_PROVIDER';

export const drizzleProvider = {
  provide: DRIZZLE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Pool({ connectionString: config.get<string>('DATABASE_URL') });
  },
};
