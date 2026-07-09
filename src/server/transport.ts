import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { logger } from '@/logging/logging.js';
import { createServer } from '@/server/server.js';

type TransportMap = Record<string, StreamableHTTPServerTransport>;

export const connectHttpTransport = async (port: number, stateless = false) => {
  const app = Fastify({ logger: false });
  const transports: TransportMap = {};

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    const credentials = resolveCredentials(request);

    let transport: StreamableHTTPServerTransport;

    if (!stateless && sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (stateless || (!sessionId && isInitializeRequest(request.body))) {
      if (!credentials) {
        return reply
          .status(400)
          .send('x-argocd-base-url and x-argocd-api-token headers are required');
      }

      transport = new StreamableHTTPServerTransport(
        stateless
          ? { sessionIdGenerator: undefined }
          : {
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (id) => {
                transports[id] = transport;
              },
            },
      );

      if (!stateless) {
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };
      }

      await createServer(credentials).connect(transport);
    } else {
      const errId = (request.body as Record<string, unknown> | null)?.id ?? null;
      return reply.status(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: sessionId
            ? `Invalid or expired session: ${sessionId}`
            : 'Not an initialization request and no session ID provided',
        },
        id: errId,
      });
    }

    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  const handleSession = async (request: FastifyRequest, reply: FastifyReply) => {
    if (stateless) {
      return reply.status(405).send('Not allowed in stateless mode');
    }
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      return reply.status(400).send('Invalid or missing session ID');
    }
    reply.hijack();
    await transports[sessionId].handleRequest(request.raw, reply.raw);
  };

  app.get('/mcp', handleSession);
  app.delete('/mcp', handleSession);

  await app.listen({ port, host: '0.0.0.0' });
  logger.info(`MCP server on http://0.0.0.0:${port}${stateless ? ' [stateless]' : ''}`);
};

export const connectStdioTransport = async () => {
  const argocdBaseUrl = process.env.ARGOCD_BASE_URL ?? '';
  const argocdApiToken = process.env.ARGOCD_API_TOKEN ?? '';

  if (!argocdBaseUrl || !argocdApiToken) {
    logger.error('ARGOCD_BASE_URL and ARGOCD_API_TOKEN env vars are required for stdio transport');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await createServer({ argocdBaseUrl, argocdApiToken }).connect(transport);
  logger.info('MCP server running on stdio');
};

function resolveCredentials(
  request: FastifyRequest,
): { argocdBaseUrl: string; argocdApiToken: string } | null {
  const argocdBaseUrl =
    (request.headers['x-argocd-base-url'] as string) || process.env.ARGOCD_BASE_URL || '';
  const argocdApiToken =
    (request.headers['x-argocd-api-token'] as string) || process.env.ARGOCD_API_TOKEN || '';
  if (!argocdBaseUrl || !argocdApiToken) return null;
  return { argocdBaseUrl, argocdApiToken };
}
