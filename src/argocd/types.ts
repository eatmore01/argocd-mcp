export type Cluster = {
  name: string;
  server: string;
  connectionState?: {
    status?: string;
    message?: string;
  };
  info?: {
    serverVersion?: string;
  };
};

export type ClusterList = {
  items?: Cluster[];
};

export type ApplicationDestination = {
  server?: string;
  name?: string;
  namespace?: string;
};

export type ApplicationSource = {
  repoURL?: string;
  path?: string;
  targetRevision?: string;
  chart?: string;
  helm?: unknown;
  kustomize?: unknown;
  directory?: unknown;
};

export type ApplicationResource = {
  group?: string;
  version?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  status?: string;
  health?: { status?: string; message?: string };
};

export type Application = {
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    project?: string;
    source?: ApplicationSource;
    sources?: ApplicationSource[];
    destination?: ApplicationDestination;
    syncPolicy?: unknown;
  };
  status?: {
    sync?: { status?: string; revision?: string };
    health?: { status?: string; message?: string };
    operationState?: {
      phase?: string;
      message?: string;
      startedAt?: string;
      finishedAt?: string;
      syncResult?: { revision?: string };
    };
    reconciledAt?: string;
    resources?: ApplicationResource[];
    conditions?: Array<{ type?: string; message?: string; lastTransitionTime?: string }>;
    history?: Array<{
      id?: number;
      revision?: string;
      deployedAt?: string;
      source?: ApplicationSource;
    }>;
    summary?: { images?: string[]; externalURLs?: string[] };
  };
};

export type ApplicationList = {
  items?: Application[];
};

export type ManifestResponse = {
  manifests?: string[];
  namespace?: string;
  server?: string;
  revision?: string;
  sourceType?: string;
};

export type ApplicationLookup = {
  /** Application name */
  name: string;
  /** Namespace the Application object lives in (apps-in-any-namespace) */
  appNamespace?: string;
  /** AppProject the application belongs to */
  project?: string;
};

/** Input for creating a new AppProject. */
export type CreateProjectInput = {
  /** Project name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Allowed source Git repo URLs (default: ['*']) */
  sourceRepos?: string[];
  /** Allowed deployment destinations (default: any server / any namespace) */
  destinations?: ApplicationDestination[];
  /** Allowed cluster-scoped resource kinds (default: all) */
  clusterResourceWhitelist?: Array<{ group: string; kind: string }>;
  /** Allowed namespaced resource kinds (default: all) */
  namespaceResourceWhitelist?: Array<{ group: string; kind: string }>;
  /** Create even if a project with this name already exists */
  upsert?: boolean;
};

/** Input for creating a new Application. */
export type CreateApplicationInput = {
  /** Application name */
  name: string;
  /** Namespace the Application object lives in (apps-in-any-namespace) */
  appNamespace?: string;
  /** AppProject the application belongs to (default: 'default') */
  project?: string;
  /** Source Git/Helm repo URL */
  repoURL: string;
  /** Path within the repo (for plain manifests / kustomize / Helm dir) */
  path?: string;
  /** Helm chart name (when sourcing a chart instead of a path) */
  chart?: string;
  /** Git/Helm target revision (default: 'HEAD') */
  targetRevision?: string;
  /** Destination cluster server URL (use this OR destName) */
  destServer?: string;
  /** Destination cluster registered name (use this OR destServer) */
  destName?: string;
  /** Destination namespace */
  destNamespace: string;
  /** Enable automated sync policy */
  autoSync?: boolean;
  /** With autoSync: prune resources removed from source */
  prune?: boolean;
  /** With autoSync: self-heal drift automatically */
  selfHeal?: boolean;
  /** Add CreateNamespace=true sync option */
  createNamespace?: boolean;
  /** Update the application if it already exists */
  upsert?: boolean;
};

/** Input for syncing an Application. */
export type SyncApplicationInput = ApplicationLookup & {
  /** Git/Helm revision to sync to (defaults to the app's target revision) */
  revision?: string;
  /** Prune resources that no longer exist in the source */
  prune?: boolean;
  /** Preview the sync without applying changes */
  dryRun?: boolean;
  /** Sync only these resources (defaults to all); e.g. {kind:'Deployment',name:'web'} */
  resources?: Array<{
    group?: string;
    kind: string;
    name: string;
    namespace?: string;
  }>;
};

/** Input for deleting an Application. */
export type DeleteApplicationInput = ApplicationLookup & {
  /** Cascade delete the app's managed resources from the cluster (default: true) */
  cascade?: boolean;
  /** Deletion propagation policy when cascading: 'foreground' | 'background' | 'orphan' */
  propagationPolicy?: 'foreground' | 'background' | 'orphan';
};

/** Lightweight view of an application for list overviews. */
export type ApplicationSummary = {
  name?: string;
  namespace?: string;
  project?: string;
  destination?: ApplicationDestination;
  syncStatus?: string;
  healthStatus?: string;
  lastSyncAt?: string;
};
