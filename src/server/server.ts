import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ArgoCDClient } from '@/argocd/client.js';
import {
  CreateProjectInput,
  CreateApplicationInput,
  SyncApplicationInput,
  DeleteApplicationInput,
} from '@/argocd/types.js';

type ServerInfo = {
  argocdBaseUrl: string;
  argocdApiToken: string;
};

type ToolSchema = Record<string, z.ZodType>;

export class Server extends McpServer {
  private readonly argocdClient: ArgoCDClient;

  constructor({ argocdBaseUrl, argocdApiToken }: ServerInfo) {
    super({ name: 'argo-mcp-server-hh', version: '0.1.0' });
    this.argocdClient = new ArgoCDClient(argocdBaseUrl, argocdApiToken);

    this.addJsonOutputTool(
      'list_clusters',
      'Returns list of clusters registered in ArgoCD',
      {
        server: z.string().optional().describe('Filter by server URL'),
        name: z.string().optional().describe('Filter by name'),
      },
      async ({ server, name }: { server?: string; name?: string }) =>
        this.argocdClient.listClusters({ server, name }),
    );

    this.addJsonOutputTool(
      'list_applications',
      'Returns ArgoCD applications, optionally filtered to a specific cluster. ' +
        'The cluster may be given as its server URL or registered name. ' +
        'Returns a lightweight overview (name, project, destination, sync/health status, last sync) ' +
        'unless `full` is set.',
      {
        cluster: z
          .string()
          .optional()
          .describe('Cluster server URL or registered name to filter applications by'),
        project: z.string().optional().describe('Filter by AppProject name'),
        full: z
          .boolean()
          .optional()
          .describe('Return full raw application objects instead of a lightweight summary'),
      },
      async ({ cluster, project, full }: { cluster?: string; project?: string; full?: boolean }) =>
        this.argocdClient.listApplications({ cluster, project, full }),
    );

    this.addJsonOutputTool(
      'get_application',
      'Returns full metadata for a single application: sync state, health, last sync time, ' +
        'source(s), destination, operation state, conditions, recent deploy history and a ' +
        'resource summary. Set `full` for the raw, untrimmed ArgoCD object.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z
          .string()
          .optional()
          .describe('Namespace the Application object lives in (apps-in-any-namespace)'),
        project: z.string().optional().describe('AppProject the application belongs to'),
        full: z.boolean().optional().describe('Return the raw, untrimmed application object'),
      },
      async ({
        name,
        appNamespace,
        project,
        full,
      }: {
        name: string;
        appNamespace?: string;
        project?: string;
        full?: boolean;
      }) => this.argocdClient.getApplication({ name, appNamespace, project, full }),
    );

    this.addJsonOutputTool(
      'get_application_manifests',
      'Returns the fully rendered Kubernetes manifests ArgoCD produces for the application. ' +
        'Useful for debugging what is actually being applied to the cluster.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z.string().optional().describe('Namespace the Application object lives in'),
        project: z.string().optional().describe('AppProject the application belongs to'),
        revision: z
          .string()
          .optional()
          .describe('Git/Helm revision to render manifests for (defaults to target revision)'),
      },
      async ({
        name,
        appNamespace,
        project,
        revision,
      }: {
        name: string;
        appNamespace?: string;
        project?: string;
        revision?: string;
      }) => this.argocdClient.getApplicationManifests({ name, appNamespace, project, revision }),
    );

    this.addJsonOutputTool(
      'get_application_resource_tree',
      'Returns the live resource tree of an application (nodes with health and sync info). ' +
        'Useful for deep debugging of which resources are degraded or out of sync.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z.string().optional().describe('Namespace the Application object lives in'),
        project: z.string().optional().describe('AppProject the application belongs to'),
      },
      async ({
        name,
        appNamespace,
        project,
      }: {
        name: string;
        appNamespace?: string;
        project?: string;
      }) => this.argocdClient.getApplicationResourceTree({ name, appNamespace, project }),
    );

    this.addJsonOutputTool(
      'get_application_events',
      'Returns Kubernetes events for an application (optionally scoped to a single managed ' +
        'resource). Surfaces scheduling failures, image pull errors, probe failures, etc. — ' +
        'the first place to look when a resource is degraded.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z.string().optional().describe('Namespace the Application object lives in'),
        project: z.string().optional().describe('AppProject the application belongs to'),
        resourceName: z
          .string()
          .optional()
          .describe('Scope events to a specific managed resource by name'),
        resourceNamespace: z
          .string()
          .optional()
          .describe('Namespace of the managed resource to scope events to'),
        resourceUID: z
          .string()
          .optional()
          .describe('UID of the managed resource to scope events to'),
      },
      async ({
        name,
        appNamespace,
        project,
        resourceName,
        resourceNamespace,
        resourceUID,
      }: {
        name: string;
        appNamespace?: string;
        project?: string;
        resourceName?: string;
        resourceNamespace?: string;
        resourceUID?: string;
      }) =>
        this.argocdClient.getApplicationEvents({
          name,
          appNamespace,
          project,
          resourceName,
          resourceNamespace,
          resourceUID,
        }),
    );

    this.addJsonOutputTool(
      'get_application_managed_resources',
      'Returns the resources ArgoCD manages for an application together with their desired ' +
        '(target) and live state — the data behind the ArgoCD diff view. Useful for debugging ' +
        'drift and out-of-sync resources.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z.string().optional().describe('Namespace the Application object lives in'),
        project: z.string().optional().describe('AppProject the application belongs to'),
      },
      async ({
        name,
        appNamespace,
        project,
      }: {
        name: string;
        appNamespace?: string;
        project?: string;
      }) => this.argocdClient.getApplicationManagedResources({ name, appNamespace, project }),
    );

    this.addJsonOutputTool(
      'create_project',
      'Creates a new ArgoCD AppProject. By default the project is permissive (any source repo, ' +
        'any destination cluster/namespace, all resource kinds) — narrow it with `sourceRepos`, ' +
        '`destinations` and the resource whitelists. Set `upsert` to overwrite an existing project.',
      {
        name: z.string().describe('Project name'),
        description: z.string().optional().describe('Human-readable description'),
        sourceRepos: z
          .array(z.string())
          .optional()
          .describe("Allowed source Git repo URLs (default: ['*'] = any)"),
        destinations: z
          .array(
            z.object({
              server: z.string().optional().describe('Destination cluster server URL'),
              name: z.string().optional().describe('Destination cluster registered name'),
              namespace: z.string().optional().describe('Allowed namespace (supports globs)'),
            }),
          )
          .optional()
          .describe('Allowed deployment destinations (default: any server / any namespace)'),
        clusterResourceWhitelist: z
          .array(z.object({ group: z.string(), kind: z.string() }))
          .optional()
          .describe("Allowed cluster-scoped resource kinds (default: [{group:'*',kind:'*'}])"),
        namespaceResourceWhitelist: z
          .array(z.object({ group: z.string(), kind: z.string() }))
          .optional()
          .describe('Allowed namespaced resource kinds (default: all)'),
        upsert: z
          .boolean()
          .optional()
          .describe('Overwrite the project if one with this name already exists'),
      },
      async (args: CreateProjectInput) => this.argocdClient.createProject(args),
    );

    this.addJsonOutputTool(
      'create_application',
      'Creates a new ArgoCD Application from a Git/Helm source and deploys it to a destination ' +
        'cluster + namespace. Provide exactly one of `destServer` (cluster URL) or `destName` ' +
        '(registered cluster name). Enable GitOps auto-sync with `autoSync` (plus optional ' +
        '`prune`/`selfHeal`), and `createNamespace` to have ArgoCD create the target namespace.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z
          .string()
          .optional()
          .describe('Namespace the Application object lives in (apps-in-any-namespace)'),
        project: z.string().optional().describe("AppProject to attach to (default: 'default')"),
        repoURL: z.string().describe('Source Git or Helm repository URL'),
        path: z
          .string()
          .optional()
          .describe('Path within the repo (plain manifests / kustomize / Helm dir)'),
        chart: z
          .string()
          .optional()
          .describe('Helm chart name (when sourcing a chart instead of a path)'),
        targetRevision: z
          .string()
          .optional()
          .describe("Git/Helm target revision (default: 'HEAD')"),
        destServer: z
          .string()
          .optional()
          .describe('Destination cluster server URL (use this OR destName)'),
        destName: z
          .string()
          .optional()
          .describe('Destination cluster registered name (use this OR destServer)'),
        destNamespace: z.string().describe('Destination namespace'),
        autoSync: z.boolean().optional().describe('Enable automated sync policy'),
        prune: z
          .boolean()
          .optional()
          .describe('With autoSync: prune resources removed from source'),
        selfHeal: z.boolean().optional().describe('With autoSync: self-heal drift automatically'),
        createNamespace: z
          .boolean()
          .optional()
          .describe('Add CreateNamespace=true sync option so ArgoCD creates the namespace'),
        upsert: z.boolean().optional().describe('Update the application if it already exists'),
      },
      async (args: CreateApplicationInput) => this.argocdClient.createApplication(args),
    );

    this.addJsonOutputTool(
      'sync_application',
      'Triggers a sync (deploy) of an ArgoCD application, applying the target revision to the ' +
        'destination cluster. By default syncs all resources to the app target revision; narrow ' +
        'with `revision`, `resources`, `prune` (remove resources gone from source) or `dryRun` ' +
        '(preview only). Returns the application with its started operation state.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z.string().optional().describe('Namespace the Application object lives in'),
        project: z.string().optional().describe('AppProject the application belongs to'),
        revision: z
          .string()
          .optional()
          .describe("Git/Helm revision to sync to (defaults to the app's target revision)"),
        prune: z
          .boolean()
          .optional()
          .describe('Prune resources that no longer exist in the source'),
        dryRun: z.boolean().optional().describe('Preview the sync without applying changes'),
        resources: z
          .array(
            z.object({
              group: z.string().optional().describe('API group of the resource'),
              kind: z.string().describe('Resource kind, e.g. Deployment'),
              name: z.string().describe('Resource name'),
              namespace: z.string().optional().describe('Resource namespace'),
            }),
          )
          .optional()
          .describe('Sync only these specific resources (defaults to all)'),
      },
      async (args: SyncApplicationInput) => this.argocdClient.syncApplication(args),
    );

    this.addJsonOutputTool(
      'delete_application',
      'Deletes an ArgoCD application. By default this cascades — the resources ArgoCD manages ' +
        'are also removed from the destination cluster. Set `cascade: false` to delete only the ' +
        'Application object and leave its resources running (orphan them). DESTRUCTIVE.',
      {
        name: z.string().describe('Application name'),
        appNamespace: z.string().optional().describe('Namespace the Application object lives in'),
        project: z.string().optional().describe('AppProject the application belongs to'),
        cascade: z
          .boolean()
          .optional()
          .describe("Also delete the app's managed cluster resources (default: true)"),
        propagationPolicy: z
          .enum(['foreground', 'background', 'orphan'])
          .optional()
          .describe('Deletion propagation policy when cascading (default: foreground)'),
      },
      async (args: DeleteApplicationInput) => this.argocdClient.deleteApplication(args),
    );
  }

  private addJsonOutputTool(
    name: string,
    description: string,
    schema: ToolSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (args: any) => Promise<unknown>,
  ) {
    this.registerTool(name, { description, inputSchema: schema }, async (args) => {
      try {
        const result = await cb(args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    });
  }
}

export const createServer = (serverInfo: ServerInfo) => new Server(serverInfo);
