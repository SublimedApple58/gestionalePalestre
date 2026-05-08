#!/usr/bin/env node
/**
 * Replay del payload "remote opening" intercettato dai Device Logs.
 * Lo proviamo su entrambi i DP candidati (unlock_phone_remote_kit, remote_no_dp_key).
 *
 * Run:
 *   node apps/web/scripts/tuya-test-replay.mjs
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const content = readFileSync(envPath, "utf8");
for (const line of content.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("="); if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const BASE_URL  = process.env.TUYA_BASE_URL    ?? "https://openapi.tuyaeu.com";
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID;

const sha256hex = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmacUpper = (sec, c) => crypto.createHmac("sha256", sec).update(c).digest("hex").toUpperCase();
const nonce = () => crypto.randomUUID().replace(/-/g, "");

function sign({ token, t, n, method, path, body }) {
  const stringToSign = [method, sha256hex(body), "", path].join("\n");
  return hmacUpper(CLIENT_SECRET, CLIENT_ID + token + t + n + stringToSign);
}

async function getToken() {
  const path = "/v1.0/token?grant_type=1";
  const t = Date.now().toString(), n = nonce();
  const s = sign({ token: "", t, n, method: "GET", path, body: "" });
  const r = await fetch(`${BASE_URL}${path}`, {
    headers: { client_id: CLIENT_ID, sign: s, t, nonce: n, sign_method: "HMAC-SHA256" }
  });
  const j = await r.json();
  if (!j.success) throw new Error(`Token: ${j.msg}`);
  return j.result.access_token;
}

async function send(token, code, value) {
  const path = `/v1.0/devices/${DEVICE_ID}/commands`;
  const body = JSON.stringify({ commands: [{ code, value }] });
  const t = Date.now().toString(), n = nonce();
  const s = sign({ token, t, n, method: "POST", path, body });
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      client_id: CLIENT_ID, access_token: token,
      sign: s, t, nonce: n, sign_method: "HMAC-SHA256",
      "Content-Type": "application/json"
    },
    body
  });
  return r.json();
}

async function pause(ms) {
  await new Promise(r => setTimeout(r, ms));
}

// payload esatto intercettato dall'app Tuya Smart (con padding base64 corretto)
const REPLAY_VALUE_NO_PAD = "AQABMDk4ODIyOTE0AAQAA";       // come mostrato nei log
const REPLAY_VALUE_PADDED = "AQABMDk4ODIyOTE0AAQAAA==";    // con padding base64

const candidates = [
  { code: "unlock_phone_remote_kit", value: REPLAY_VALUE_PADDED },
  { code: "unlock_phone_remote_kit", value: REPLAY_VALUE_NO_PAD },
  { code: "remote_no_dp_key",         value: REPLAY_VALUE_PADDED },
  { code: "remote_no_dp_key",         value: REPLAY_VALUE_NO_PAD },
];

async function run() {
  console.log("🔑 Token...");
  const token = await getToken();
  console.log("   ✅\n");
  console.log("📢 Stai accanto alla porta. Provo 4 combinazioni in sequenza,");
  console.log("    una ogni 4 secondi. Annota quando senti il CLICK.\n");

  await pause(2000);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    console.log(`━━━ Tentativo ${i+1}/4 ━━━`);
    console.log(`   code  : ${c.code}`);
    console.log(`   value : ${c.value}`);
    console.log(`   👂 ASCOLTA ORA...`);
    const r = await send(token, c.code, c.value);
    console.log(`   resp  : success=${r.success}${r.msg ? " msg="+r.msg : ""}${r.code ? " code="+r.code : ""}`);
    await pause(4000);
    console.log("");
  }

  console.log("✨ Test completato.");
  console.log("   Dimmi: quale tentativo (1, 2, 3 o 4) ha aperto la porta?");
  console.log("   Se nessuno → andiamo di Plan B (Tap-to-Run scene da app Tuya).");
}

run().catch(e => { console.error("💥", e); process.exit(1); });
