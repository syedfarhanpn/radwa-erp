/**
 * Radwa Gulf and Co — future API client.
 *
 * NOTHING IN THIS FILE MAKES A NETWORK REQUEST. The demo is frontend-only; this
 * module exists so the backend developer has one obvious place to wire the
 * Laravel REST API and the FastAPI AI services in.
 *
 * How to switch the app over to a real backend
 * --------------------------------------------
 * 1. Set `NEXT_PUBLIC_RADWA_API_BASE_URL` (and `NEXT_PUBLIC_RADWA_AI_BASE_URL`).
 * 2. Implement `createApiRepository()` below against `RadwaRepository`, using
 *    `request()` and the mappers in `./adapters.ts`.
 * 3. In `src/store/useDemoStore.ts`, replace the mock repository wiring with the
 *    API repository. No screen imports either one directly — they all go through
 *    `useRepository()`.
 *
 * The proposed endpoint list is in `docs/API_CONTRACT.md`.
 */

import type { RadwaRepository } from "../repository";

export const apiConfig = {
  /** Laravel REST API base, e.g. `https://erp.radwa.example/api/v1`. */
  baseUrl: process.env.NEXT_PUBLIC_RADWA_API_BASE_URL ?? "",
  /** FastAPI service that will produce real BOQ suggestions. */
  aiBaseUrl: process.env.NEXT_PUBLIC_RADWA_AI_BASE_URL ?? "",
  /** Wall-clock budget for a single request, in milliseconds. */
  timeoutMs: 20_000,
  /** Laravel Sanctum / bearer token resolution happens here. */
  getAuthToken: (): string | null => null,
} as const;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Laravel validation payload: `{ field: [message] }`, already flattened. */
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * Single place where HTTP concerns live: base URL, auth header, timeout,
 * error-shape normalisation. Guarded so an accidental call in the demo fails
 * loudly instead of silently hitting an unconfigured host.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiConfig.baseUrl) {
    throw new ApiError(
      "This application is running in demo mode. No API base URL is configured, so no network request was made.",
      0,
    );
  }

  const url = new URL(path.replace(/^\//, ""), `${apiConfig.baseUrl.replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const token = apiConfig.getAuthToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiConfig.timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? controller.signal,
    });

    const payload = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
      // Laravel returns `{ message, errors: { field: [msg, ...] } }` on 422.
      const raw = (payload ?? {}) as { message?: string; errors?: Record<string, string[]> };
      const fieldErrors = raw.errors
        ? Object.fromEntries(Object.entries(raw.errors).map(([k, v]) => [k, v[0] ?? "Invalid value."]))
        : undefined;
      throw new ApiError(raw.message ?? `Request failed with status ${response.status}.`, response.status, fieldErrors);
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Not implemented in this phase — the frontend demo runs entirely on the mock
 * repository. Left as an explicit stub rather than a half-written client so the
 * backend developer starts from a clean slate.
 */
export function createApiRepository(): RadwaRepository {
  throw new Error(
    "createApiRepository() is not implemented in the frontend demo. Implement RadwaRepository against the endpoints in docs/API_CONTRACT.md.",
  );
}
