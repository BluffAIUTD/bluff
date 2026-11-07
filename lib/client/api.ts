/** Small typed fetch helper: returns parsed JSON, or throws ApiFailure with the shared error shape's message. */
export class ApiFailure extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure("upstream_down", "Can't reach Bluff. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFailure(body?.error?.code ?? "upstream_down", body?.error?.message ?? "Something went wrong. Try again.", res.status);
  return body as T;
}
