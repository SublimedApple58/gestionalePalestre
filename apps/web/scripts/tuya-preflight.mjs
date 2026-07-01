/**
 * Tuya access-control — PREFLIGHT (uso on-site, es. arrivo tastierino nuovo).
 *
 * Verifica in un colpo solo che l'integrazione cloud sia pronta PRIMA di
 * affidarsi ai cron/UI del gestionale. Replica la firma HMAC e il flusso PIN
 * di `src/lib/tuya/client.ts` + `access-control.ts`, ma standalone (no build).
 *
 * USO:
 *   # legge le var da un file .env (default: apps/web/.env.local)
 *   node apps/web/scripts/tuya-preflight.mjs [percorso/.env]
 *
 *   # oppure passandole inline
 *   TUYA_CLIENT_ID=... TUYA_CLIENT_SECRET=... TUYA_DEVICE_ID=... \
 *     node apps/web/scripts/tuya-preflight.mjs
 *
 *   # aggiungi --write per fare anche il ciclo REALE crea→abilita PIN→disabilita→
 *   # cancella su un utente di test "PREFLIGHT_TEST" (poi ripulisce). Senza --write
 *   # fa solo i controlli in lettura (token, device online, open-logs).
 *
 * Vars richieste: TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_DEVICE_ID.
 * Opzionali: TUYA_BASE_URL (default openapi.tuyaeu.com).
 */

import crypto from "crypto";
import fs from "fs";

// ─── Carica le env (da file .env se presente) ────────────────────────────────
const args = process.argv.slice(2);
const doWrite = args.includes("--write");
const envPath = args.find((a) => !a.startsWith("--")) ?? "apps/web/.env.local";

const env = { ...process.env };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = env.TUYA_BASE_URL || "https://openapi.tuyaeu.com";
const CLIENT_ID = env.TUYA_CLIENT_ID;
const SECRET = env.TUYA_CLIENT_SECRET;
const DEVICE_ID = env.TUYA_DEVICE_ID;

if (!CLIENT_ID || !SECRET || !DEVICE_ID) {
  console.error("❌ Mancano TUYA_CLIENT_ID / TUYA_CLIENT_SECRET / TUYA_DEVICE_ID.");
  process.exit(1);
}

// ─── Firma Tuya (identica a client.ts) ───────────────────────────────────────
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("hex").toUpperCase();
const nonce = () => crypto.randomUUID().replace(/-/g, "");

let token = null;
async function getToken() {
  if (token) return token;
  const path = "/v1.0/token?grant_type=1";
  const t = Date.now().toString();
  const n = nonce();
  const sign = hmac(CLIENT_ID + "" + t + n + ["GET", sha256(""), "", path].join("\n"));
  const res = await fetch(BASE + path, {
    headers: { client_id: CLIENT_ID, sign, t, nonce: n, sign_method: "HMAC-SHA256" }
  });
  const j = await res.json();
  if (!j.success) throw new Error(`token: ${j.msg} (code ${j.code})`);
  token = j.result.access_token;
  return token;
}

async function api(method, path, body) {
  const at = await getToken();
  const t = Date.now().toString();
  const n = nonce();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sign = hmac(CLIENT_ID + at + t + n + [method, sha256(bodyStr), "", path].join("\n"));
  const headers = { client_id: CLIENT_ID, access_token: at, sign, t, nonce: n, sign_method: "HMAC-SHA256" };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, ...(body ? { body: bodyStr } : {}) });
  const j = await res.json();
  if (!j.success) throw new Error(`[${j.code ?? res.status}] ${j.msg ?? "unknown"}`);
  return j.result;
}

// ─── AES per il PIN (identico ad access-control.ts) ──────────────────────────
function decryptTicketKey(hex) {
  const d = crypto.createDecipheriv("aes-256-ecb", Buffer.from(SECRET, "utf-8"), null);
  d.setAutoPadding(true);
  return Buffer.concat([d.update(Buffer.from(hex, "hex")), d.final()]);
}
function encryptPin(pin, key) {
  const c = crypto.createCipheriv("aes-128-ecb", key, null);
  c.setAutoPadding(true);
  return Buffer.concat([c.update(pin, "utf-8"), c.final()]).toString("hex");
}

// ─── Esecuzione ──────────────────────────────────────────────────────────────
const ok = (m) => console.log(`✅ ${m}`);
const ko = (m) => console.log(`❌ ${m}`);

(async () => {
  console.log(`\n🔎 Preflight Tuya — device ${DEVICE_ID} @ ${BASE}\n`);

  // 1. Auth + quota
  try { await getToken(); ok("Auth cloud OK (account vivo, quota non esaurita)"); }
  catch (e) { ko(`Auth FALLITA: ${e.message}`); process.exit(1); }

  // 2. Device presente nell'account + online
  try {
    const d = await api("GET", `/v1.0/devices/${DEVICE_ID}`);
    ok(`Device trovato: "${d.name}" — online: ${d.online} — category: ${d.category}`);
    if (!d.online) ko("  ⚠️ device OFFLINE: verifica WiFi/abbinamento prima di procedere");
    if (d.category !== "mk") ko(`  ⚠️ category ${d.category} ≠ mk: l'integrazione è per keypad 'mk'`);
  } catch (e) { ko(`Device NON raggiungibile (abbinato a QUESTO account?): ${e.message}`); }

  // 3. Open-logs (registro ingressi) — ultime 24h
  try {
    const end = Date.now(), start = end - 24 * 60 * 60 * 1000;
    const r = await api("GET",
      `/v1.1/devices/${DEVICE_ID}/door-lock/open-logs?end_time=${end}&page_no=1&page_size=20&start_time=${start}`);
    ok(`Open-logs OK — ${r?.total ?? 0} ingressi nelle ultime 24h`);
  } catch (e) { ko(`Open-logs FALLITO: ${e.message}`); }

  // 4. (--write) ciclo reale crea utente → PIN → cancella → cleanup
  if (doWrite) {
    const testPin = "246810";
    let uid = null;
    try {
      uid = await api("POST", `/v1.0/devices/${DEVICE_ID}/user`, { nick_name: "PREFLIGHT_TEST" });
      ok(`Utente test creato: ${uid}`);
      const ticket = await api("POST", `/v1.0/devices/${DEVICE_ID}/door-lock/password-ticket`, {});
      const key = decryptTicketKey(ticket.ticket_key);
      await api("PUT", `/v1.0/devices/${DEVICE_ID}/door-lock/actions/entry`, {
        user_id: uid, user_type: 2, unlock_type: "password", password_type: "ticket",
        ticket_id: ticket.ticket_id, password: encryptPin(testPin, key)
      });
      ok(`PIN test ${testPin} SCRITTO sul tastierino (prova ad aprire con ${testPin} ORA)`);
      await api("DELETE",
        `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${uid}/unlock-types/password/keys/1`)
        .then(() => ok("PIN test rimosso")).catch((e) => ko(`Rimozione PIN: ${e.message}`));
    } catch (e) {
      ko(`Ciclo scrittura PIN FALLITO: ${e.message}`);
    } finally {
      if (uid) await api("DELETE", `/v1.0/devices/${DEVICE_ID}/users/${uid}`)
        .then(() => ok("Utente test cancellato (cleanup)"))
        .catch((e) => ko(`Cleanup utente test: ${e.message} — cancellalo a mano da Smart Life`));
    }
  } else {
    console.log("\nℹ️  Solo controlli in lettura. Aggiungi --write per testare la scrittura PIN reale.");
  }

  console.log("\n✔️  Preflight terminato.\n");
})();
