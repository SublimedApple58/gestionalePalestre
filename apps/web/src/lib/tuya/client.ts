/**
 * Tuya IoT Platform — authenticated HTTP client
 *
 * Handles:
 *  - OAuth 2.0 client_credentials token fetch + auto-refresh
 *  - HMAC-SHA256 request signing (Tuya signing algorithm v1)
 *
 * Env vars required:
 *  TUYA_CLIENT_ID      — from iot.tuya.com project
 *  TUYA_CLIENT_SECRET  — from iot.tuya.com project
 *  TUYA_BASE_URL       — default: https://openapi.tuyaeu.com (Europa)
 */

import crypto from "crypto";

const BASE_URL   = process.env.TUYA_BASE_URL    ?? "https://openapi.tuyaeu.com";
const CLIENT_ID  = process.env.TUYA_CLIENT_ID!;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET!;

// ─── Token cache (module-level, persists across requests in same process) ────

type TokenCache = {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // Unix ms
};

let tokenCache: TokenCache | null = null;

// ─── Crypto helpers ───────────────────────────────────────────────────────────

function sha256hex(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hmacSha256hex(secret: string, content: string): string {
  return crypto.createHmac("sha256", secret).update(content).digest("hex").toUpperCase();
}

// ─── Tuya signing algorithm ───────────────────────────────────────────────────
//
// string_to_sign = METHOD + "\n"
//                + sha256(body)  + "\n"
//                + ""            + "\n"   ← signed-headers (none)
//                + path_with_qs
//
// sign_content (token req)  = client_id + t + nonce + string_to_sign
// sign_content (other reqs) = client_id + access_token + t + nonce + string_to_sign
//
// sign = HMAC-SHA256(client_secret, sign_content).toUpperCase()

function buildSign(opts: {
  accessToken: string;
  t:           string;
  nonce:       string;
  method:      string;
  path:        string; // path + query string
  body:        string;
}): string {
  const { accessToken, t, nonce, method, path, body } = opts;
  const sha256Body  = sha256hex(body);
  const stringToSign = [method, sha256Body, "", path].join("\n");
  const signContent  = CLIENT_ID + accessToken + t + nonce + stringToSign;
  return hmacSha256hex(CLIENT_SECRET, signContent);
}

function makeNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── Token management ─────────────────────────────────────────────────────────

type TuyaTokenResponse = {
  success: boolean;
  msg?:    string;
  result: {
    access_token:  string;
    refresh_token: string;
    expire_time:   number; // seconds
  };
};

async function fetchNewToken(): Promise<TokenCache> {
  const path   = "/v1.0/token?grant_type=1";
  const t      = Date.now().toString();
  const nonce  = makeNonce();

  // Token request uses empty access_token in sign
  const sign = buildSign({ accessToken: "", t, nonce, method: "GET", path, body: "" });

  const res  = await fetch(`${BASE_URL}${path}`, {
    method:  "GET",
    headers: {
      client_id:   CLIENT_ID,
      sign,
      t,
      nonce,
      sign_method: "HMAC-SHA256",
    },
  });

  const json = (await res.json()) as TuyaTokenResponse;

  if (!json.success) {
    throw new Error(`Tuya token fetch failed: ${json.msg ?? "unknown error"}`);
  }

  return {
    accessToken:  json.result.access_token,
    refreshToken: json.result.refresh_token,
    // refresh 60 s before actual expiry to avoid edge-case failures
    expiresAt: Date.now() + json.result.expire_time * 1000 - 60_000,
  };
}

async function getAccessToken(): Promise<string> {
  if (!tokenCache || Date.now() >= tokenCache.expiresAt) {
    tokenCache = await fetchNewToken();
  }
  return tokenCache.accessToken;
}

// ─── Public request function ──────────────────────────────────────────────────

type TuyaResponse<T> = {
  success: boolean;
  result:  T;
  msg?:    string;
  code?:   number;
  t?:      number;
};

export async function tuyaRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path:   string,  // e.g. "/v2.0/cloud/access/devices/xxx/users"
  body?:  Record<string, unknown>
): Promise<T> {
  const accessToken = await getAccessToken();
  const t           = Date.now().toString();
  const nonce       = makeNonce();
  const bodyStr     = body ? JSON.stringify(body) : "";

  const sign = buildSign({ accessToken, t, nonce, method, path, body: bodyStr });

  const headers: Record<string, string> = {
    client_id:    CLIENT_ID,
    access_token: accessToken,
    sign,
    t,
    nonce,
    sign_method:  "HMAC-SHA256",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res  = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: bodyStr } : {}),
  });

  const json = (await res.json()) as TuyaResponse<T>;

  if (!json.success) {
    throw new Error(`Tuya API error [${json.code ?? res.status}]: ${json.msg ?? "unknown"}`);
  }

  return json.result;
}
