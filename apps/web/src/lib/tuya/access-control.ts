/**
 * Tuya Smart Lock APIs for keypad WiFi F22-WRB1 (category `mk`).
 *
 * Uses the Smart Lock Open Service endpoints (v1.0) which are the only ones
 * that actually work with this consumer-tier device. The old v2.0 Access Control
 * endpoints do NOT work with `mk` devices.
 *
 * PIN creation flow:
 *   1. Create user on device → get tuyaUserId
 *   2. Get password-ticket → ticket_id + encrypted ticket_key
 *   3. Decrypt ticket_key with AES-256-ECB (key = CLIENT_SECRET)
 *   4. Encrypt PIN with AES-128-ECB (key = decrypted ticket_key)
 *   5. PUT .../door-lock/actions/entry with encrypted password
 *
 * PIN deletion:
 *   DELETE .../door-lock/user-types/2/users/{userId}/unlock-types/password/keys/{unlockNo}
 */

import crypto from "crypto";

import { tuyaRequest } from "./client";

const DEVICE_ID = process.env.TUYA_DEVICE_ID!;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET!;

// ─── Remote door open (unchanged) ────────────────────────────────────────────

export async function openDoor(): Promise<void> {
  const payload = process.env.TUYA_REMOTE_OPEN_PAYLOAD;
  if (!payload) {
    throw new Error(
      "Tuya non configurato: manca TUYA_REMOTE_OPEN_PAYLOAD. " +
        "Vedi .env.example per istruzioni."
    );
  }

  await tuyaRequest<{ result: boolean }>(
    "POST",
    `/v1.0/devices/${DEVICE_ID}/commands`,
    {
      commands: [{ code: "remote_no_dp_key", value: payload }],
    }
  );
}

// ─── Unlock logs (real keypad entries) ───────────────────────────────────────

/** Tuya status.code value for a PIN entered on the keypad. */
export const KEYPAD_PIN_UNLOCK_CODE = "unlock_password_kit";

export type DoorLockOpenLog = {
  user_id: string;
  nick_name: string;
  unlock_name?: string;
  update_time: number; // epoch milliseconds
  status?: { code: string; value: unknown };
};

/**
 * Fetch unlock logs from the keypad via the Smart Lock Open Service.
 *
 * GET /v1.1/devices/{id}/door-lock/open-logs
 * IMPORTANT: Tuya validates the HMAC signature against the query string with its
 * parameters sorted in ASCII order — so they MUST be emitted as
 * end_time, page_no, page_size, start_time. Any other order → "sign invalid".
 *
 * Returns the raw logs; callers filter by `status.code` (keypad PIN entries use
 * KEYPAD_PIN_UNLOCK_CODE). `user_id` maps to `User.tuyaUserId`.
 */
export async function listDoorLockOpenLogs(params: {
  startMs: number;
  endMs: number;
  pageNo: number;
  pageSize: number;
}): Promise<{ total: number; logs: DoorLockOpenLog[] }> {
  const { startMs, endMs, pageNo, pageSize } = params;
  const qs = `end_time=${endMs}&page_no=${pageNo}&page_size=${pageSize}&start_time=${startMs}`;
  const result = await tuyaRequest<{ total?: number; logs?: DoorLockOpenLog[] }>(
    "GET",
    `/v1.1/devices/${DEVICE_ID}/door-lock/open-logs?${qs}`
  );
  return { total: result?.total ?? 0, logs: result?.logs ?? [] };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type TuyaUser = {
  user_id: string;
  nick_name: string;
  user_contact: string;
  avatar_url: string;
};

type PasswordTicket = {
  ticket_id: string;
  ticket_key: string;
  expire_time: number;
};

// ─── User management ─────────────────────────────────────────────────────────

export async function createTuyaUser(name: string): Promise<string> {
  const result = await tuyaRequest<string>(
    "POST",
    `/v1.0/devices/${DEVICE_ID}/user`,
    { nick_name: name }
  );
  return result; // tuyaUserId
}

export async function deleteTuyaUser(tuyaUserId: string): Promise<void> {
  await tuyaRequest<boolean>(
    "DELETE",
    `/v1.0/devices/${DEVICE_ID}/users/${tuyaUserId}`
  );
}

export async function listTuyaUsers(): Promise<TuyaUser[]> {
  const result = await tuyaRequest<TuyaUser[]>(
    "GET",
    `/v1.0/devices/${DEVICE_ID}/users`
  );
  return result ?? [];
}

/**
 * DIAGNOSTICA: legge le temp-password del device, che riportano la validità
 * reale (effective_time / invalid_time / schedule_list / phase). Serve a
 * vedere se le nostre password hanno una finestra oraria attaccata.
 */
export async function listTempPasswords(): Promise<unknown> {
  return await tuyaRequest<unknown>(
    "GET",
    `/v1.0/devices/${DEVICE_ID}/door-lock/temp-passwords`
  );
}

/**
 * DIAGNOSTICA: legge le "assigned keys" (metodi di sblocco) di un utente,
 * inclusi effective_time / invalid_time / schedule → così vediamo se le
 * password create via API hanno una validità/fascia oraria attaccata.
 */
export async function getAssignedKeys(tuyaUserId: string): Promise<unknown> {
  return await tuyaRequest<unknown>(
    "GET",
    `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/assigned-keys`
  );
}

/**
 * DIAGNOSTICA: legge TUTTI i data point (DP) correnti del device.
 * Confrontando lo stato "rotto" (sera) col "funzionante" (mattina) si isola il
 * DP che gate-a la validazione dei codici (es. child_lock / lock_mode / ecc.).
 */
export async function getDeviceStatus(): Promise<unknown> {
  return await tuyaRequest<unknown>("GET", `/v1.0/devices/${DEVICE_ID}/status`);
}

/**
 * DIAGNOSTICA: legge i TIMER schedulati (Device Timer service) sul device.
 * Un timer serale che manda un DP di blocco (e uno mattutino che sblocca)
 * spiegherebbe il pattern "codici KO la sera, OK la mattina, offline sempre OK".
 */
export async function listDeviceTimers(): Promise<unknown> {
  return await tuyaRequest<unknown>(
    "GET",
    `/v2.0/cloud/timer/device/${DEVICE_ID}`
  );
}

/**
 * DIAGNOSTICA: legge i record password registrati sul device per un utente.
 * Restituisce il raw così vediamo eventuali fasce orarie/validità
 * (effective_time / invalid_time / schedule / phase) attaccate al PIN.
 */
export async function listUserPasswords(tuyaUserId: string): Promise<unknown> {
  return await tuyaRequest<unknown>(
    "GET",
    `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/unlock-types/password`
  );
}

// ─── PIN crypto ──────────────────────────────────────────────────────────────

function decryptTicketKey(encryptedHex: string): Buffer {
  const key = Buffer.from(CLIENT_SECRET, "utf-8"); // 32 bytes
  const decipher = crypto.createDecipheriv("aes-256-ecb", key, null);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted; // 16 bytes = key for PIN encryption
}

function encryptPin(pin: string, ticketKey: Buffer): string {
  const cipher = crypto.createCipheriv("aes-128-ecb", ticketKey, null);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([
    cipher.update(pin, "utf-8"),
    cipher.final(),
  ]);
  return encrypted.toString("hex");
}

// ─── PIN registration ────────────────────────────────────────────────────────

async function getPasswordTicket(): Promise<PasswordTicket> {
  return await tuyaRequest<PasswordTicket>(
    "POST",
    `/v1.0/devices/${DEVICE_ID}/door-lock/password-ticket`,
    {}
  );
}

const ENABLE_PIN_MAX_ATTEMPTS = 5;
const ENABLE_PIN_RETRY_MS = 800;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Register a PIN on the keypad for a given Tuya user.
 * Returns the unlock key number (needed for deletion).
 *
 * Il tastierino applica i PIN uno alla volta in modo asincrono: se è occupato
 * risponde `2328 operation in progress`. È un errore TRANSITORIO, quindi qui
 * riproviamo (nuovo ticket ogni tentativo). Senza retry, attivare un abbonamento
 * mentre il device è occupato lasciava l'iscritto SENZA codice, in silenzio.
 */
export async function enablePin(
  tuyaUserId: string,
  pin: string
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ENABLE_PIN_MAX_ATTEMPTS; attempt++) {
    try {
      const ticket = await getPasswordTicket();
      const ticketKey = decryptTicketKey(ticket.ticket_key);
      const encryptedPin = encryptPin(pin, ticketKey);

      await tuyaRequest<boolean>(
        "PUT",
        `/v1.0/devices/${DEVICE_ID}/door-lock/actions/entry`,
        {
          user_id: tuyaUserId,
          user_type: 2,
          unlock_type: "password",
          password_type: "ticket",
          ticket_id: ticket.ticket_id,
          password: encryptedPin,
        }
      );

      // L'endpoint di lettura delle chiavi password è inaffidabile su questo
      // device (errore 1108) → restituirebbe comunque "1" via fallback. Saltiamo
      // la chiamata sprecata.
      return "1";
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error).message).toLowerCase();
      const transient =
        msg.includes("progress") || msg.includes("busy") || msg.includes("2328");
      if (transient && attempt < ENABLE_PIN_MAX_ATTEMPTS) {
        await sleep(ENABLE_PIN_RETRY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── PIN removal ─────────────────────────────────────────────────────────────

export async function disablePin(
  tuyaUserId: string,
  unlockNo: string
): Promise<void> {
  // Try with the stored unlockNo first
  try {
    await tuyaRequest<boolean>(
      "DELETE",
      `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/unlock-types/password/keys/${unlockNo}`
    );
    return;
  } catch (e) {
    console.warn(
      `[tuya] disablePin failed with unlockNo=${unlockNo} for user ${tuyaUserId}, trying to list and remove all PINs`
    );
  }

  // Fallback: list all PINs for this user and delete each one
  try {
    const result = await tuyaRequest<{ records: Array<{ unlock_no: number }> }>(
      "GET",
      `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/unlock-types/password`
    );
    if (result?.records?.length > 0) {
      for (const record of result.records) {
        try {
          await tuyaRequest<boolean>(
            "DELETE",
            `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/unlock-types/password/keys/${record.unlock_no}`
          );
        } catch {
          console.warn(`[tuya] Failed to delete key ${record.unlock_no} for user ${tuyaUserId}`);
        }
      }
      return;
    }
  } catch {
    // List endpoint not available
  }

  // Last resort: try deleting the Tuya user entirely (removes all keys)
  try {
    await deleteTuyaUser(tuyaUserId);
    console.warn(`[tuya] Deleted Tuya user ${tuyaUserId} as last resort to remove PIN`);
  } catch {
    console.error(`[tuya] Could not disable PIN for user ${tuyaUserId} — all methods failed`);
  }
}
