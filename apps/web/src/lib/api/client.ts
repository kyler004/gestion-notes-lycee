import type { ZodType } from 'zod';
import { ApiError, NetworkError } from './errors';
import { BackendErrorPayloadSchema } from './schemas';

export interface ApiAuthBridge {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onReachabilityChange?: (online: boolean) => void;
}

let authBridge: ApiAuthBridge | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

export function registerApiAuthBridge(bridge: ApiAuthBridge): void {
  authBridge = bridge;
}

async function refreshSingleFlight(): Promise<string | null> {
  if (!authBridge) return null;
  if (!inFlightRefresh) {
    inFlightRefresh = authBridge.refreshAccessToken().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export interface ApiRequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const parsed = Number.parseInt(headerValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
  let code = `HTTP_${response.status}`;
  let message = response.statusText || 'Erreur lors de la requête.';
  let details: unknown;

  try {
    const raw: unknown = await response.json();
    const parsed = BackendErrorPayloadSchema.safeParse(raw);
    if (parsed.success) {
      code = parsed.data.error.code;
      message = parsed.data.error.message;
      details = parsed.data.error.details;
    }
  } catch {
    // Le corps n'est pas du JSON valide
  }

  return new ApiError({
    status: response.status,
    code,
    message,
    details,
    retryAfterSeconds,
  });
}

async function performRawFetch(
  path: string,
  options: Pick<ApiRequestOptions<unknown>, 'method' | 'body' | 'headers' | 'auth' | 'signal'>,
  allowRetry: boolean,
): Promise<Response> {
  const { method = 'GET', body, headers = {}, auth = true, signal } = options;

  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (auth && authBridge) {
    const token = authBridge.getAccessToken();
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    authBridge?.onReachabilityChange?.(true);
  } catch (err) {
    authBridge?.onReachabilityChange?.(false);
    throw new NetworkError(
      err instanceof Error ? err.message : 'Impossible de joindre le serveur.',
    );
  }

  if (
    response.status === 401 &&
    auth &&
    allowRetry &&
    authBridge &&
    !path.startsWith('/api/auth/login') &&
    !path.startsWith('/api/auth/refresh')
  ) {
    const newToken = await refreshSingleFlight();
    if (newToken) {
      return performRawFetch(path, options, false);
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return response;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions<T> = {},
): Promise<T> {
  const response = await performRawFetch(path, options, true);

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json();
  if (options.schema) {
    return options.schema.parse(data);
  }
  return data as T;
}

export async function apiFetchBlob(
  path: string,
  options: Omit<ApiRequestOptions<Blob>, 'schema'> = {},
): Promise<Blob> {
  const response = await performRawFetch(path, options, true);
  return response.blob();
}

