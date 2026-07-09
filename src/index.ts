import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cmd } from '@/cmd/cmd.js';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');

// Redirect any startup noise to stderr before dotenv runs to put away stdin mode errors
// `env` block of a Claude/MCP client config — take priority over the .env file.
const isStdio = process.argv.includes('stdio');
if (isStdio) {
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = process.stderr.write.bind(process.stderr);
  dotenv.config({ path: envPath, override: false });
  process.stdout.write = orig;
} else {
  dotenv.config({ path: envPath, override: false });
}

cmd();
