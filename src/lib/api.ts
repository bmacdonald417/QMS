export function getApiBase() {
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
}

export function apiUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBase()}${normalized}`;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: {
    token?: string | null;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { token, method = 'GET', body, headers = {} } = options;
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(error);
  }
  return data as T;
}
