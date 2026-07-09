export interface HttpResponse<T> {
  status: number;
  body: T;
}

type SearchParams = Record<string, string | number | boolean | undefined | null> | null;

export class HttpClient {
  private readonly headers: Record<string, string>;

  constructor(
    private readonly baseUrl: string,
    apiToken: string,
  ) {
    this.headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private absUrl(path: string): URL {
    if (path.startsWith('http://') || path.startsWith('https://')) return new URL(path);
    return new URL(path, this.baseUrl);
  }

  async get<R>(path: string, params?: SearchParams): Promise<HttpResponse<R>> {
    const url = this.absUrl(path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, { headers: this.headers });
    const body = (await res.json()) as R;
    return { status: res.status, body };
  }

  async post<R>(path: string, payload: unknown, params?: SearchParams): Promise<HttpResponse<R>> {
    const url = this.absUrl(path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    return this.parse<R>(res);
  }

  async delete<R>(path: string, params?: SearchParams): Promise<HttpResponse<R>> {
    const url = this.absUrl(path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, { method: 'DELETE', headers: this.headers });
    return this.parse<R>(res);
  }

  private async parse<R>(res: Response): Promise<HttpResponse<R>> {
    const text = await res.text();
    const body = (text ? JSON.parse(text) : undefined) as R;
    if (!res.ok) {
      const message =
        (body as { message?: string; error?: string })?.message ??
        (body as { error?: string })?.error ??
        text;
      throw new Error(`ArgoCD API ${res.status} ${res.statusText}: ${message}`);
    }
    return { status: res.status, body };
  }
}
