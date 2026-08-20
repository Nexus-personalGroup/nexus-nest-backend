import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config({ quiet: true });

const { DB_USERNAME, DB_PASSWORD, DB_HOST, DB_PORT, DB_DATABASE } = process.env;

const DATABASE_URL = `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;

const command = process.argv.slice(2).join(' ');

execSync(command, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL },
});
