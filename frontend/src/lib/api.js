const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5001/api/v1";

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let accessToken = null;
let refreshInFlight = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include"
    }).then(async (response) => {
      if (!response.ok) return null;
      const result = await response.json();
      setAccessToken(result.accessToken);
      return result.accessToken;
    }).catch(() => null).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function send(path, options, token) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  return fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
}

export async function apiRequest(path, options = {}) {
  let response = await send(path, options, accessToken);
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const renewed = await refreshAccessToken();
    if (renewed) response = await send(path, options, renewed);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error?.message ?? "Request failed", response.status, body.error?.code);
  }
  if (response.status === 204) return undefined;
  return response.json();
}
