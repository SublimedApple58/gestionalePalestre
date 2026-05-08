#!/usr/bin/env node
/**
 * Tuya diagnostic script — verifies credentials + discovers device capabilities.
 *
 * Run with:
 *   node apps/web/scripts/tuya-diagnostic.mjs
 *
 * Reads TUYA_* env vars from apps/web/.env.local automatically.
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ─── Load .env.local manually (no dotenv dep) ────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

try {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch (e) {
  console.error(`❌ Impossibile leggere ${envPath}:`, e.message);
  process.exit(1);
}

const BASE_URL  = process.env.TUYA_BASE_URL    ?? "https://openapi.tuyaeu.com";
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID;

if (!CLIENT_ID || !CLIENT_SECRET || !DEVICE_ID) {
  console.error("❌ Mancano env vars: TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_DEVICE_ID");
  process.exit(1);
}

console.log("🔧 Config:");
console.log(`   BASE_URL  : ${BASE_URL}`);
console.log(`   CLIENT_ID : ${CLIENT_ID}`);
console.log(`   DEVICE_ID : ${DEVICE_ID}`);
console.log("");

// ─── Tuya signing ────────────────────────────────────────────────────────────

function sha256hex(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function hmacUpper(secret, content) {
  return crypto.createHmac("sha256", secret).update(content).digest("hex").toUpperCase();
}
function nonce() { return crypto.randomUUID().replace(/-/g, ""); }

function sign({ accessToken, t, n, method, path, body }) {
  const stringToSign = [method, sha256hex(body), "", path].join("\n");
  const signContent  = CLIENT_ID + accessToken + t + n + stringToSign;
  return hmacUpper(CLIENT_SECRET, signContent);
}

async function getToken() {
  const path = "/v1.0/token?grant_type=1";
  const t = Date.now().toString();
  const n = nonce();
  const s = sign({ accessToken: "", t, n, method: "GET", path, body: "" });
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { client_id: CLIENT_ID, sign: s, t, nonce: n, sign_method: "HMAC-SHA256" }
  });
  const json = await res.json();
  if (!json.success) throw new Error(`Token failed: ${json.msg} (code ${json.code})`);
  return json.result.access_token;
}

async function call(token, method, path) {
  const t = Date.now().toString();
  const n = nonce();
  const s = sign({ accessToken: token, t, n, method, path, body: "" });
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      client_id: CLIENT_ID, access_token: token,
      sign: s, t, nonce: n, sign_method: "HMAC-SHA256"
    }
  });
  return res.json();
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

async function run() {
  // 1. Token
  console.log("1️⃣  Richiesta access token...");
  let token;
  try {
    token = await getToken();
    console.log(`   ✅ Token ottenuto (${token.slice(0, 16)}...)`);
  } catch (e) {
    console.error(`   ❌ ${e.message}`);
    console.error("   → Verifica TUYA_CLIENT_ID/SECRET, e che il Data Center sia Central Europe.");
    process.exit(1);
  }
  console.log("");

  // 2. Device info
  console.log("2️⃣  Info device...");
  const info = await call(token, "GET", `/v1.0/devices/${DEVICE_ID}`);
  if (info.success) {
    const d = info.result;
    console.log(`   ✅ Trovato: ${d.name}`);
    console.log(`      • product_name : ${d.product_name}`);
    console.log(`      • category     : ${d.category}`);
    console.log(`      • online       : ${d.online ? "🟢" : "🔴"}`);
    console.log(`      • model        : ${d.model ?? "-"}`);
    console.log(`      • product_id   : ${d.product_id}`);
  } else {
    console.error(`   ❌ ${info.msg} (code ${info.code})`);
    if (info.code === 28841105) {
      console.error("   → Permessi insufficienti. Vai su iot.tuya.com -> Cloud -> Devices");
      console.error("     -> 'Link App Account' -> Modify -> alza permission a Read & Write.");
    }
  }
  console.log("");

  // 3. Specifications (data points / commands disponibili)
  console.log("3️⃣  Specifiche device (command codes)...");
  const spec = await call(token, "GET", `/v1.0/devices/${DEVICE_ID}/specifications`);
  if (spec.success) {
    const fns = spec.result.functions ?? [];
    const sts = spec.result.status ?? [];
    console.log(`   ✅ ${fns.length} comandi disponibili (functions):`);
    for (const f of fns) {
      console.log(`      • ${f.code}  (type: ${f.type}, values: ${f.values})`);
    }
    if (fns.length === 0) {
      console.log("   ⚠️  Nessuna function esposta — il device potrebbe richiedere");
      console.log("       l'API Access Control v2.0 (PIN management) invece dei");
      console.log("       commands generici. Vediamo lo status:");
    }
    console.log(`   📊 ${sts.length} status leggibili:`);
    for (const s of sts) {
      console.log(`      • ${s.code}  (type: ${s.type})`);
    }
  } else {
    console.error(`   ❌ ${spec.msg} (code ${spec.code})`);
  }
  console.log("");

  // 4. Current device status (legge i valori attuali dei DP)
  console.log("4️⃣  Stato attuale device...");
  const status = await call(token, "GET", `/v1.0/devices/${DEVICE_ID}/status`);
  if (status.success) {
    console.log(`   ✅ ${status.result.length} DP letti:`);
    for (const dp of status.result) {
      console.log(`      • ${dp.code} = ${JSON.stringify(dp.value)}`);
    }
  } else {
    console.error(`   ❌ ${status.msg} (code ${status.code})`);
  }
  console.log("");

  console.log("✨ Diagnostica completata.");
  console.log("   Cerca nei comandi (functions) sopra qualcosa tipo:");
  console.log("   - 'unlock', 'remote_unlock_without_pwd', 'switch_1', 'open_door'");
  console.log("   Quel code lo useremo per inviare il comando 'apri porta'.");
}

run().catch((e) => { console.error("💥 Errore inatteso:", e); process.exit(1); });
