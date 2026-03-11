/**
 * Tuya Access Control — high-level wrapper
 *
 * Wraps the Tuya Access Control REST API for a single keypad device.
 * Device ID comes from TUYA_DEVICE_ID env var.
 *
 * API docs: https://developer.tuya.com/en/docs/cloud/access-control
 */

import { tuyaRequest } from "./client";

const DEVICE_ID = process.env.TUYA_DEVICE_ID!;

// Base path for access control device endpoints
const deviceBase = () => `/v2.0/cloud/access/devices/${DEVICE_ID}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type TuyaMember = {
  user_id:        string; // Tuya-side user ID (store this in your DB for deletion)
  name:           string;
  open_type:      string; // "psd" = password/PIN
  effective_time: number; // 0 = permanent
  invalid_time:   number; // 0 = permanent
};

export type TuyaAccessRecord = {
  user_id:     string;
  user_name:   string;
  open_time:   number; // Unix timestamp ms
  open_type:   string; // "psd" = PIN
  open_result: number; // 0 = success, 1 = fail
};

export type AddMemberParams = {
  userId:  string; // your internal user ID — used as Tuya user_id
  name:    string; // display name on the device
  pinCode: string; // numeric PIN (4–8 digits depending on device config)
};

// ─── API calls ────────────────────────────────────────────────────────────────

/** List all members/PINs currently stored on the device */
export async function listMembers(): Promise<TuyaMember[]> {
  const result = await tuyaRequest<{ list: TuyaMember[] }>(
    "GET",
    `${deviceBase()}/users`
  );
  return result.list ?? [];
}

/**
 * Add a member with a PIN code to the device.
 *
 * Returns the Tuya user_id assigned to this member.
 * Store it in your DB (e.g. User.tuyaUserId) so you can call removeMember later.
 */
export async function addMember(params: AddMemberParams): Promise<string> {
  const result = await tuyaRequest<{ user_id: string }>(
    "POST",
    `${deviceBase()}/users`,
    {
      user_id:        params.userId,
      name:           params.name,
      open_type:      "psd",        // psd = password/PIN
      open_psd:       params.pinCode,
      effective_time: 0,            // 0 = permanent
      invalid_time:   0,
    }
  );
  return result.user_id;
}

/**
 * Remove a member from the device by their Tuya user_id.
 * Use the user_id returned by addMember (stored in your DB).
 */
export async function removeMember(tuyaUserId: string): Promise<void> {
  await tuyaRequest<unknown>(
    "DELETE",
    `${deviceBase()}/users/${tuyaUserId}`
  );
}

/**
 * Get access records (door open/fail events) from the device.
 *
 * @param startTime  Unix ms — defaults to 24h ago
 * @param endTime    Unix ms — defaults to now
 * @param pageSize   Max records to return (default 50, max 100)
 */
export async function getAccessRecords(opts?: {
  startTime?: number;
  endTime?:   number;
  pageSize?:  number;
}): Promise<TuyaAccessRecord[]> {
  const now       = Date.now();
  const startTime = opts?.startTime ?? now - 24 * 60 * 60 * 1000;
  const endTime   = opts?.endTime   ?? now;
  const pageSize  = opts?.pageSize  ?? 50;

  const qs = new URLSearchParams({
    start_time: startTime.toString(),
    end_time:   endTime.toString(),
    page_size:  pageSize.toString(),
  });

  const result = await tuyaRequest<{ list: TuyaAccessRecord[] }>(
    "GET",
    `${deviceBase()}/records?${qs.toString()}`
  );
  return result.list ?? [];
}
