export async function request_json<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (HTTP ${response.status})`);
  return result as T;
}

export function submit_json<T>(path: string, input: unknown): Promise<T> {
  return request_json<T>(path, { method: 'POST', body: JSON.stringify(input) });
}
