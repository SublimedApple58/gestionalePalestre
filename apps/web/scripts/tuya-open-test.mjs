#!/usr/bin/env node
/**
 * Tuya open-door test — invia il comando "apri" e ti dice se la chiamata
 * è andata a buon fine. Tu fisicamente ascolti se la serratura scatta.
 *
 * Run:
 *   node apps/web/scripts/tuya-open-test.mjs
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ─── Load .env.local ─────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const content = readFileSync(envPath, "utf8");
for (const line of content.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const BASE_URL  = process.env.TUYA_BASE_URL    ?? "https://openapi.tuyaeu.com";
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID;

// ─── Tuya signing ────────────────────────────────────────────────────────────
const sha256hex = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmacUpper = (sec, c) => crypto.createHmac("sha256", sec).update(c).digest("hex").toUpperCase();
const nonce     = () => crypto.randomUUID().replace(/-/g, "");

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

async function sendCommand(token, code, value) {
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

// ─── Run ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log("🔑 Token...");
  const token = await getToken();
  console.log("   ✅ ok\n");

  console.log("🚪 Invio comando: normal_open_switch = true");
  console.log("   (mette la serratura in 'rilascio momentaneo')");
  console.log("   ⏳ ASCOLTA la porta — dovresti sentire un CLICK fra 1-2 secondi\n");

  const r1 = await sendCommand(token, "normal_open_switch", true);
  console.log("   Response:", JSON.stringify(r1, null, 2));

  if (!r1.success) {
    console.error("\n❌ Comando rifiutato dal cloud Tuya.");
    if (r1.code === 28841105 || r1.code === 1106) {
      console.error("   → Permessi insufficienti. Vai su iot.tuya.com:");
      console.error("     Cloud → Devices → 'Change' accanto a 'Read'");
      console.error("     → seleziona 'Read, Write, Manage' (o 'Read and Write')");
      console.error("     → poi rilancia questo script.");
    }
    process.exit(1);
  }

  console.log("\n   ✅ Comando inviato con successo (cloud OK)");
  console.log("   ⏳ Aspetto 2 secondi e poi richiudo...\n");
  await new Promise(r => setTimeout(r, 2000));

  console.log("🔒 Invio comando: normal_open_switch = false (richiudi)");
  const r2 = await sendCommand(token, "normal_open_switch", false);
  console.log("   Response:", JSON.stringify(r2, null, 2));
  console.log(r2.success ? "   ✅ Richiusura ok" : "   ⚠️  Richiusura fallita (la auto-lock dovrebbe comunque scattare)");

  console.log("\n✨ Test completato.");
  console.log("   ➡️  Hai sentito il CLICK della serratura? Dimmi sì/no.");
}

run().catch(e => { console.error("💥", e); process.exit(1); });
