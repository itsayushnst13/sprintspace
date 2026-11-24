const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5001/api/v1";

type ApiErrorBody = { error?: { message?: string; code?: string } };
type RefreshResponse = { accessToken: string };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include"
    }).then(async (response) => {
      if (!response.ok) return null;
      const result = await response.json() as RefreshResponse;
      setAccessToken(result.accessToken);
      return result.accessToken;
    }).catch(() => null).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function send(path: string, options: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  return fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await send(path, options, accessToken);
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const renewed = await refreshAccessToken();
    if (renewed) response = await send(path, options, renewed);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? "Request failed", response.status, body.error?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
