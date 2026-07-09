# ArgoCD MCP Server

A minimal [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
read-only ArgoCD operations as tools, so developers and DevOps engineers can inspect
clusters and applications (state, sync status, manifests, events, drift) directly from an
MCP client such as Claude.

It talks to the ArgoCD REST API over HTTP using a Bearer API token and ships two transports:
**stdio** (for desktop MCP clients) and **streamable HTTP** (for shared/hosted use).

## Configuration

Credentials are read, in priority order:

1. **stdio**: `ARGOCD_BASE_URL` / `ARGOCD_API_TOKEN` from the process environment
   (e.g. the `env` block of your MCP client config).
2. **HTTP**: `x-argocd-base-url` / `x-argocd-api-token` request headers, falling back to the
   same environment variables.
3. A local `.env` file next to the build — this is loaded with `override: false`, so any env
   var already set by your MCP client config **wins** over the `.env` file.

| Variable            | Description                          |
| ------------------- | ------------------------------------ |
| `ARGOCD_BASE_URL`   | Base URL of the ArgoCD API server    |
| `ARGOCD_API_TOKEN`  | ArgoCD API token (Bearer)            |

### Run

```bash
yarn install
yarn build

# stdio (desktop MCP clients)
node dist/index.js stdio

# HTTP (default), port 3000
node dist/index.js            # or: node dist/index.js http --port 3000
node dist/index.js http --stateless   # one transport per request, no session tracking
```

During development:

```bash
yarn dev            # HTTP, tsx watch
yarn dev:stateless  # HTTP stateless, tsx watch
```




### MCP client config (published package, stdio)

```json
{
  "mcpServers": {
    "argocd": {
      "command": "npx",
      "args": ["-y", "@yazhivotnoe/argocd-mcp", "stdio"],
      "env": {
        "ARGOCD_BASE_URL": "https://argocd.example.com",
        "ARGOCD_API_TOKEN": "<api-token>"
      }
    }
  }
}
```

If installed globally, use `"command": "argocd-mcp", "args": ["stdio"]` instead. There is no
bundled `.env` when installed from the registry, so credentials must come from the `env` block.


### Example MCP client config (HTTP remote)

Claude Desktop's `claude_desktop_config.json` `mcpServers` block only launches **stdio** servers
(`command`/`args`/`env`) — a bare `{"type":"http","url":...}` entry is not picked up, and the
Connectors UI can't send custom `x-argocd-*` headers. To use a remote HTTP server with headers,
bridge it through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) as a stdio command:

```json
{
  "mcpServers": {
    "argocd": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://argocd.mcp/mcp",
        "--header",
        "x-argocd-base-url: http://argo.cluster.svc:8080",
        "--header",
        "x-argocd-api-token: <argocd-api-token>"
      ]
    }
  }
}
```

- `x-argocd-base-url` / `x-argocd-api-token` are required (unless the server has them in its own
  env) — they tell the server which ArgoCD to talk to and with what token.


### Example MCP client config (stdio local)

```json
{
  "mcpServers": {
    "argocd": {
      "command": "node",
      "args": ["dist/index.js", "stdio"],
      "env": {
        "ARGOCD_BASE_URL": "https://argocd.example.com",
        "ARGOCD_API_TOKEN": "<token>"
      }
    }
  }
}
```

**Consume:**

```bash
npm i -g @yazhivotnoe/argocd-mcp
argocd-mcp stdio
```

## Available tools

| Tool                                | What it does |
| ----------------------------------- | ------------ |
| `list_clusters`                     | Lists clusters registered in ArgoCD. Optional filters: `server`, `name`. |
| `list_applications`                 | Lists applications, optionally filtered to a cluster (`cluster` = server URL **or** registered name; the name/URL is resolved against the cluster registry so it matches regardless of how the app stores its destination). Optional `project` filter. Returns a lightweight overview (name, project, destination, sync/health status, last sync time) unless `full: true`. |
| `get_application`                   | Full metadata for one application: source(s), destination, sync state + revision, health, **last sync time**, `reconciledAt`, operation state, conditions, recent deploy history, images, external URLs, and a resource summary (counts by health/sync). Set `full: true` for the raw, untrimmed object. Supports `appNamespace` and `project`. |
| `get_application_manifests`         | Fully rendered Kubernetes manifests ArgoCD produces for the app. Optional `revision`. For debugging what is actually applied. |
| `get_application_resource_tree`     | Live resource tree (nodes with health/sync). For deep debugging of degraded / out-of-sync resources. |
| `get_application_events`            | Kubernetes events for an app, optionally scoped to a single managed resource (`resourceName` / `resourceNamespace` / `resourceUID`). Surfaces scheduling failures, image pull errors, probe failures, etc. |
| `get_application_managed_resources` | Resources ArgoCD manages with their desired (target) vs live state — the data behind the ArgoCD diff view. For debugging drift and out-of-sync resources. |
| `create_project`                    | **Write.** Creates a new AppProject. Defaults are permissive (any repo / any destination / all resource kinds); narrow with `sourceRepos`, `destinations`, `clusterResourceWhitelist`, `namespaceResourceWhitelist`. `upsert` overwrites an existing project. |
| `create_application`                | **Write.** Creates a new Application from a Git/Helm `repoURL` (+ `path` or `chart`, `targetRevision`) deployed to `destNamespace` on either `destServer` (cluster URL) or `destName` (registered name). Optional `project`, `appNamespace`, `autoSync` (+ `prune`/`selfHeal`), `createNamespace`, `upsert`. |
| `sync_application`                  | **Write.** Triggers a sync (deploy) of an application to its target revision. Optional `revision`, `resources` (sync a subset), `prune`, `dryRun` (preview). Supports `appNamespace`/`project`. |
| `delete_application`                | **Write / destructive.** Deletes an application. Cascades by default (also removes managed cluster resources); set `cascade: false` to orphan them. Optional `propagationPolicy` (`foreground`/`background`/`orphan`), `appNamespace`/`project`. |

All tools return JSON as text content. Errors are returned as MCP tool errors with the
message text.

## Architecture

```
src/
  index.ts              Entry point: loads .env (override:false), runs the CLI
  cmd/cmd.ts            yargs CLI — `http` (default) and `stdio` commands
  server/
    transport.ts        Fastify HTTP transport + stdio transport; credential resolution
    server.ts           McpServer subclass; registers tools via addJsonOutputTool
  argocd/
    client.ts           ArgoCDClient — typed methods mapping to ArgoCD REST endpoints
    http.ts             Thin fetch wrapper with Bearer auth
  logging/logging.ts    pino logger
```

Adding a new tool is two steps: add a method to `ArgoCDClient`, then register it in
`Server`'s constructor with `addJsonOutputTool(name, description, zodSchema, handler)`.
