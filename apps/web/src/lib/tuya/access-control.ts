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

/**
 * Register a PIN on the keypad for a given Tuya user.
 * Returns the unlock key number (needed for deletion).
 */
export async function enablePin(
  tuyaUserId: string,
  pin: string
): Promise<string> {
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

  // After enablePin, we need to get the unlock key number.
  // We poll the device status for the unlock_method_create DP which contains
  // the hardware-assigned key number in bytes 6-7 (big-endian).
  // As a simpler approach, we list the user's unlock methods to find the latest one.
  const unlockNo = await getLatestUnlockNo(tuyaUserId);
  return unlockNo;
}

/**
 * Get the latest password unlock key number for a user by listing their unlock records.
 * Falls back to "1" if we can't determine it (single PIN per user scenario).
 */
async function getLatestUnlockNo(tuyaUserId: string): Promise<string> {
  try {
    const result = await tuyaRequest<{ records: Array<{ unlock_no: number }> }>(
      "GET",
      `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/unlock-types/password`
    );
    if (result?.records?.length > 0) {
      const latest = result.records.at(-1);
      if (latest) return String(latest.unlock_no);
    }
  } catch {
    // If this endpoint doesn't work, we'll store what we can
    console.warn(
      `[tuya] Could not list unlock keys for user ${tuyaUserId}, falling back`
    );
  }
  return "1";
}

// ─── PIN removal ─────────────────────────────────────────────────────────────

export async function disablePin(
  tuyaUserId: string,
  unlockNo: string
): Promise<void> {
  await tuyaRequest<boolean>(
    "DELETE",
    `/v1.0/devices/${DEVICE_ID}/door-lock/user-types/2/users/${tuyaUserId}/unlock-types/password/keys/${unlockNo}`
  );
}
