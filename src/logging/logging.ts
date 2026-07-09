import pino from 'pino';

// Writes to stderr so stdout stays clean for the stdio MCP transport
export const logger = pino(process.stderr);
