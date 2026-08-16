import 'dotenv/config';
import { Pool } from 'pg';
import { seedDatabase } from '../src/database/seed-data';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
seedDatabase(pool)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
