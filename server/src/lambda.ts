import { handle, type ApiRequest, type Deps } from './api';

/** The parts of a Lambda function URL event (payload format 2.0) that the API uses. */
export interface FunctionUrlEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

export interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function toApiRequest(event: FunctionUrlEvent): ApiRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [k, value] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = value;
  const body =
    event.body !== undefined && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return {
    method: event.requestContext.http.method.toUpperCase(),
    path: event.rawPath,
    query: Object.fromEntries(new URLSearchParams(event.rawQueryString ?? '')),
    headers,
    body,
  };
}

/**
 * The Lambda entry point for given dependencies. CORS (allowed origins, preflight) is configured on the
 * function URL itself, so responses don't add CORS headers.
 */
export function createHandler(deps: Deps) {
  return async (event: FunctionUrlEvent): Promise<FunctionUrlResult> => {
    const res = await handle(toApiRequest(event), deps);
    return {
      statusCode: res.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: res.body === null ? '' : JSON.stringify(res.body),
    };
  };
}
