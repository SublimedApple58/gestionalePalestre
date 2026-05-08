#!/usr/bin/env node
/**
 * Tuya multi-strategy door open test.
 * Prova diversi endpoint in sequenza. Ascolta la porta dopo ogni "Provo:".
 *
 * Run:
 *   node apps/web/scripts/tuya-test-multi.mjs
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

async function call(token, method, path, body) {
  const t = Date.now().toString(), n = nonce();
  const bodyStr = body ? JSON.stringify(body) : "";
  const s = sign({ token, t, n, method, path, body: bodyStr });
  const headers = {
    client_id: CLIENT_ID, access_token: token,
    sign: s, t, nonce: n, sign_method: "HMAC-SHA256"
  };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(`${BASE_URL}${path}`, {
    method, headers, ...(body ? { body: bodyStr } : {})
  });
  return r.json();
}

async function pause(ms, label) {
  process.stdout.write(`   ⏳ aspetto ${ms/1000}s${label ? " (" + label + ")" : ""}...\n`);
  await new Promise(r => setTimeout(r, ms));
}

// ─── Strategie ───────────────────────────────────────────────────────────────

async function strat1_passwordTicket(token) {
  console.log("\n━━━ STRATEGIA 1: Smart Lock password-free open-door ━━━");
  console.log("→ Get ticket...");
  const tk = await call(token, "POST", `/v1.0/devices/${DEVICE_ID}/door-lock/password-ticket`, {});
  console.log("   ", JSON.stringify(tk));
  if (!tk.success) {
    console.log("   ❌ ticket fallito → strategia non supportata");
    return false;
  }
  const ticketId = tk.result?.ticket_id;
  console.log(`→ Open door con ticket ${ticketId}...`);
  console.log("   👂 ASCOLTA ORA per 3 secondi...");
  const op = await call(token, "POST", `/v1.0/smart-lock/devices/${DEVICE_ID}/password-free/open-door`, {
    ticket_id: ticketId
  });
  console.log("   ", JSON.stringify(op));
  await pause(3000);
  return op.success === true;
}

async function strat2_remoteUnlock(token) {
  console.log("\n━━━ STRATEGIA 2: command 'remote_unlock_without_pwd' ━━━");
  console.log("→ Sending remote_unlock_without_pwd: true ...");
  console.log("   👂 ASCOLTA ORA per 3 secondi...");
  const r = await call(token, "POST", `/v1.0/devices/${DEVICE_ID}/commands`, {
    commands: [{ code: "remote_unlock_without_pwd", value: true }]
  });
  console.log("   ", JSON.stringify(r));
  await pause(3000);
  return r.success === true;
}

async function strat3_normalOpenLong(token) {
  console.log("\n━━━ STRATEGIA 3: normal_open_switch toggle 5 sec ━━━");
  console.log("→ Sending normal_open_switch: true ...");
  console.log("   👂 ASCOLTA ORA — la porta dovrebbe rilasciare per 5 secondi...");
  const r1 = await call(token, "POST", `/v1.0/devices/${DEVICE_ID}/commands`, {
    commands: [{ code: "normal_open_switch", value: true }]
  });
  console.log("   ", JSON.stringify(r1));
  await pause(5000, "porta dovrebbe essere aperta");
  console.log("→ Richiudo con normal_open_switch: false ...");
  const r2 = await call(token, "POST", `/v1.0/devices/${DEVICE_ID}/commands`, {
    commands: [{ code: "normal_open_switch", value: false }]
  });
  console.log("   ", JSON.stringify(r2));
  return r1.success === true;
}

async function strat4_remoteNoPdSetkey(token) {
  console.log("\n━━━ STRATEGIA 4: remote_no_pd_setkey con payload simbolico ━━━");
  // 'AQ==' = base64 di 0x01 (simple boolean trigger)
  console.log("→ Sending remote_no_pd_setkey: 'AQ==' ...");
  console.log("   👂 ASCOLTA ORA per 3 secondi...");
  const r = await call(token, "POST", `/v1.0/devices/${DEVICE_ID}/commands`, {
    commands: [{ code: "remote_no_pd_setkey", value: "AQ==" }]
  });
  console.log("   ", JSON.stringify(r));
  await pause(3000);
  return r.success === true;
}

// ─── Run tutto ───────────────────────────────────────────────────────────────
async function run() {
  console.log("🔑 Token...");
  const token = await getToken();
  console.log("   ✅\n");

  console.log("📢 IMPORTANTE: stai vicino alla porta. Dopo ogni 'ASCOLTA ORA',");
  console.log("    se senti un CLICK fai partire un cronometro mentale e poi");
  console.log("    quando lo script finisce dimmi quale strategia ha aperto.");
  console.log("");

  await pause(2000, "preparati");

  await strat1_passwordTicket(token).catch(e => console.log("   💥", e.message));
  await pause(2000, "pausa fra strategie");

  await strat2_remoteUnlock(token).catch(e => console.log("   💥", e.message));
  await pause(2000, "pausa");

  await strat3_normalOpenLong(token).catch(e => console.log("   💥", e.message));
  await pause(2000, "pausa");

  await strat4_remoteNoPdSetkey(token).catch(e => console.log("   💥", e.message));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✨ Test completato.");
  console.log("   Dimmi quale strategia (1, 2, 3 o 4) ha fatto CLICK!");
  console.log("   Se nessuna → niente paura, abbiamo plan B con Tap-to-Run scene.");
}

run().catch(e => { console.error("💥 Fatale:", e); process.exit(1); });
