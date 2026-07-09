import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { connectHttpTransport, connectStdioTransport } from '@/server/transport.js';

export const cmd = () => {
  yargs(hideBin(process.argv))
    .command(
      ['http', '$0'],
      'Start ArgoCD MCP server over HTTP',
      (y) =>
        y
          .option('port', { type: 'number', default: 3000, description: 'Port to listen on' })
          .option('stateless', {
            type: 'boolean',
            default: false,
            description: 'Disable session tracking (one transport per request)',
          }),
      ({ port, stateless }) => connectHttpTransport(port, stateless),
    )
    .command(
      'stdio',
      'Start ArgoCD MCP server over stdio (for Claude Desktop)',
      () => {},
      () => connectStdioTransport(),
    )
    .parse();
};
