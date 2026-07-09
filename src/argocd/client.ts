import { HttpClient } from '@/argocd/http.js';

import {
  ClusterList,
  Application,
  ApplicationSummary,
  ApplicationList,
  ApplicationLookup,
  ManifestResponse,
  ApplicationResource,
  ApplicationSource,
  ApplicationDestination,
  CreateProjectInput,
  CreateApplicationInput,
  SyncApplicationInput,
  DeleteApplicationInput,
} from '@/argocd/types.js';

export class ArgoCDClient {
  private readonly http: HttpClient;

  constructor(baseUrl: string, apiToken: string) {
    this.http = new HttpClient(baseUrl, apiToken);
  }

  // GET List CLusters
  async listClusters(params?: { server?: string; name?: string }): Promise<ClusterList> {
    const query: Record<string, string> = {};
    if (params?.server) query.server = params.server;
    if (params?.name) query.name = params.name;

    const { body } = await this.http.get<ClusterList>(
      '/api/v1/clusters',
      Object.keys(query).length > 0 ? query : null,
    );
    return body;
  }

  // GET List applications
  async listApplications(params?: {
    cluster?: string;
    project?: string;
    full?: boolean;
  }): Promise<{ count: number; items: Application[] | ApplicationSummary[] }> {
    const query: Record<string, string> = {};
    if (params?.project) query.projects = params.project;

    const { body } = await this.http.get<ApplicationList>(
      '/api/v1/applications',
      Object.keys(query).length > 0 ? query : null,
    );

    let items = body.items ?? [];

    if (params?.cluster) {
      const match = await this.resolveClusterMatch(params.cluster);
      items = items.filter((app) => {
        const dest = app.spec?.destination;
        return (
          (dest?.server != null && match.servers.has(dest.server)) ||
          (dest?.name != null && match.names.has(dest.name))
        );
      });
    }

    return {
      count: items.length,
      items: params?.full ? items : items.map(summarizeApplicationLite),
    };
  }

  // GET Application
  async getApplication(
    lookup: ApplicationLookup & { full?: boolean },
  ): Promise<Application | ReturnType<typeof summarizeApplication>> {
    const app = await this.fetchApplication(lookup);
    return lookup.full ? app : summarizeApplication(app);
  }

  // GET Application manifests
  async getApplicationManifests(
    lookup: ApplicationLookup & { revision?: string },
  ): Promise<ManifestResponse> {
    const query = this.lookupQuery(lookup);
    if (lookup.revision) query.revision = lookup.revision;
    const { body } = await this.http.get<ManifestResponse>(
      `/api/v1/applications/${encodeURIComponent(lookup.name)}/manifests`,
      Object.keys(query).length > 0 ? query : null,
    );
    return body;
  }

  // GET Application resource tree
  async getApplicationResourceTree(lookup: ApplicationLookup): Promise<unknown> {
    const query = this.lookupQuery(lookup);
    const { body } = await this.http.get<unknown>(
      `/api/v1/applications/${encodeURIComponent(lookup.name)}/resource-tree`,
      Object.keys(query).length > 0 ? query : null,
    );
    return body;
  }

  // GET Application events
  async getApplicationEvents(
    lookup: ApplicationLookup & {
      resourceName?: string;
      resourceNamespace?: string;
      resourceUID?: string;
    },
  ): Promise<unknown> {
    const query = this.lookupQuery(lookup);
    if (lookup.resourceName) query.resourceName = lookup.resourceName;
    if (lookup.resourceNamespace) query.resourceNamespace = lookup.resourceNamespace;
    if (lookup.resourceUID) query.resourceUID = lookup.resourceUID;
    const { body } = await this.http.get<unknown>(
      `/api/v1/applications/${encodeURIComponent(lookup.name)}/events`,
      Object.keys(query).length > 0 ? query : null,
    );
    return body;
  }

  // GET Application managed resources
  async getApplicationManagedResources(lookup: ApplicationLookup): Promise<unknown> {
    const query = this.lookupQuery(lookup);
    const { body } = await this.http.get<unknown>(
      `/api/v1/applications/${encodeURIComponent(lookup.name)}/managed-resources`,
      Object.keys(query).length > 0 ? query : null,
    );
    return body;
  }

  // POST Create AppProject
  async createProject(input: CreateProjectInput): Promise<unknown> {
    const project = {
      metadata: { name: input.name },
      spec: {
        description: input.description,
        sourceRepos: input.sourceRepos ?? ['*'],
        destinations: input.destinations ?? [{ server: '*', namespace: '*' }],
        clusterResourceWhitelist: input.clusterResourceWhitelist ?? [{ group: '*', kind: '*' }],
        ...(input.namespaceResourceWhitelist
          ? { namespaceResourceWhitelist: input.namespaceResourceWhitelist }
          : {}),
      },
    };
    const { body } = await this.http.post<unknown>('/api/v1/projects', {
      project,
      upsert: input.upsert ?? false,
    });
    return body;
  }

  // POST Create Application
  async createApplication(input: CreateApplicationInput): Promise<unknown> {
    if (!input.destServer && !input.destName) {
      throw new Error('Either destServer or destName must be provided');
    }

    const source: ApplicationSource = {
      repoURL: input.repoURL,
      targetRevision: input.targetRevision ?? 'HEAD',
    };
    if (input.path) source.path = input.path;
    if (input.chart) source.chart = input.chart;

    const destination: ApplicationDestination = { namespace: input.destNamespace };
    if (input.destServer) destination.server = input.destServer;
    if (input.destName) destination.name = input.destName;

    const syncOptions: string[] = [];
    if (input.createNamespace) syncOptions.push('CreateNamespace=true');

    const spec: Record<string, unknown> = {
      project: input.project ?? 'default',
      source,
      destination,
    };
    if (input.autoSync || syncOptions.length > 0) {
      spec.syncPolicy = {
        ...(input.autoSync
          ? { automated: { prune: input.prune ?? false, selfHeal: input.selfHeal ?? false } }
          : {}),
        ...(syncOptions.length > 0 ? { syncOptions } : {}),
      };
    }

    const application = {
      metadata: {
        name: input.name,
        ...(input.appNamespace ? { namespace: input.appNamespace } : {}),
      },
      spec,
    };

    const { body } = await this.http.post<unknown>('/api/v1/applications', application, {
      upsert: input.upsert ?? false,
    });
    return body;
  }

  // POST Sync Application
  async syncApplication(input: SyncApplicationInput): Promise<unknown> {
    const payload: Record<string, unknown> = { name: input.name };
    if (input.appNamespace) payload.appNamespace = input.appNamespace;
    if (input.project) payload.project = input.project;
    if (input.revision) payload.revision = input.revision;
    if (input.prune != null) payload.prune = input.prune;
    if (input.dryRun != null) payload.dryRun = input.dryRun;
    if (input.resources) payload.resources = input.resources;

    const { body } = await this.http.post<unknown>(
      `/api/v1/applications/${encodeURIComponent(input.name)}/sync`,
      payload,
    );
    return body;
  }

  // DELETE Application
  async deleteApplication(input: DeleteApplicationInput): Promise<unknown> {
    const query = this.lookupQuery(input);
    if (input.cascade != null) query.cascade = String(input.cascade);
    if (input.propagationPolicy) query.propagationPolicy = input.propagationPolicy;

    const { body } = await this.http.delete<unknown>(
      `/api/v1/applications/${encodeURIComponent(input.name)}`,
      Object.keys(query).length > 0 ? query : null,
    );
    return body ?? { deleted: input.name };
  }

  private async fetchApplication(lookup: ApplicationLookup): Promise<Application> {
    const query = this.lookupQuery(lookup);
    const { body } = await this.http.get<Application>(
      `/api/v1/applications/${encodeURIComponent(lookup.name)}`,
      Object.keys(query).length > 0 ? query : null,
    );
    return body;
  }

  private lookupQuery(lookup: ApplicationLookup): Record<string, string> {
    const query: Record<string, string> = {};
    if (lookup.appNamespace) query.appNamespace = lookup.appNamespace;
    if (lookup.project) query['project'] = lookup.project;
    return query;
  }

  private async resolveClusterMatch(
    cluster: string,
  ): Promise<{ servers: Set<string>; names: Set<string> }> {
    const servers = new Set<string>([cluster]);
    const names = new Set<string>([cluster]);
    try {
      const { items } = await this.listClusters();
      const found = (items ?? []).find((c) => c.server === cluster || c.name === cluster);
      if (found) {
        if (found.server) servers.add(found.server);
        if (found.name) names.add(found.name);
      }
    } catch {
      // Cluster registry unavailable
    }
    return { servers, names };
  }
}

function summarizeApplicationLite(app: Application): ApplicationSummary {
  const status = app.status ?? {};
  return {
    name: app.metadata?.name,
    namespace: app.metadata?.namespace,
    project: app.spec?.project,
    destination: app.spec?.destination,
    syncStatus: status.sync?.status,
    healthStatus: status.health?.status,
    lastSyncAt: lastSyncAt(app),
  };
}

function summarizeApplication(app: Application) {
  const status = app.status ?? {};
  const op = status.operationState;
  const resources = status.resources ?? [];
  return {
    name: app.metadata?.name,
    namespace: app.metadata?.namespace,
    project: app.spec?.project,
    createdAt: app.metadata?.creationTimestamp,
    labels: app.metadata?.labels,
    destination: app.spec?.destination,
    source: app.spec?.source,
    sources: app.spec?.sources,
    syncPolicy: app.spec?.syncPolicy,
    sync: {
      status: status.sync?.status,
      revision: status.sync?.revision,
    },
    health: status.health,
    lastSyncAt: lastSyncAt(app),
    reconciledAt: status.reconciledAt,
    operationState: op
      ? {
          phase: op.phase,
          message: op.message,
          startedAt: op.startedAt,
          finishedAt: op.finishedAt,
          syncedRevision: op.syncResult?.revision,
        }
      : undefined,
    conditions: status.conditions,
    history: (status.history ?? []).slice(-5),
    images: status.summary?.images,
    externalURLs: status.summary?.externalURLs,
    resourceSummary: summarizeResources(resources),
    resources,
  };
}

function summarizeResources(resources: ApplicationResource[]) {
  const byHealth: Record<string, number> = {};
  const bySync: Record<string, number> = {};
  for (const r of resources) {
    const h = r.health?.status ?? 'Unknown';
    const s = r.status ?? 'Unknown';
    byHealth[h] = (byHealth[h] ?? 0) + 1;
    bySync[s] = (bySync[s] ?? 0) + 1;
  }
  return { total: resources.length, byHealth, bySync };
}

function lastSyncAt(app: Application): string | undefined {
  const status = app.status ?? {};
  const history = status.history ?? [];
  return (
    status.operationState?.finishedAt ??
    history[history.length - 1]?.deployedAt ??
    status.reconciledAt
  );
}
