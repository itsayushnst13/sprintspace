const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5001/api/v1";

type ApiErrorBody = { error?: { message?: string; code?: string } };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options, headers, credentials: "include"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? "Request failed", response.status, body.error?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
