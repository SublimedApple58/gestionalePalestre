# Tuya Tech Support — Ticket (paste in English)

**Subject:** Cloud-API passwords on a `mk` WiFi keypad stop working every night (~20:00–08:00) and recover in the morning; app-created passwords work 24/7. How do we create permanent passwords via API that the controller validates locally?

---

## Our situation

We run a 24/7 gym. Access to the gym is controlled by a single Tuya WiFi keypad (model **F22-WRB1**, category `mk`). Each member with an active subscription gets a personal numeric PIN; our backend creates and revokes these PINs automatically via your Cloud API. There are about **165 active member PINs** on the device.

## The problem (this is hurting us in production)

The member PINs created by our backend **work during the day but stop being accepted by the keypad every night**, roughly from **20:00 to 08:00**, then start working again by themselves in the morning. This happens every single day. Members arrive at night, type their correct PIN, and the keypad rejects it — they are locked out of the gym.

Key facts we have verified ourselves:

1. **The device is online the whole time.** During the nightly failure window, remote unlock via your API (`/v1.0/devices/{id}/commands`) still works, and the device shows as online on the platform. So it is not a connectivity outage on our side — the Wi-Fi at the gym works during the failure (tested on a phone).

2. **Passwords created from the Tuya Smart app work 24/7**, including at night, on the SAME device, at the SAME moment our API-created passwords are being rejected. We tested this side by side:
   - App-created code (user record shows `user_type: 20`) → opens the door at night. ✅
   - Our API-created codes (`user_type: 2`) → rejected at night. ❌

3. The failure is **not** a schedule/validity issue: all codes are set to "permanent / forever", both the app ones and ours.

4. **Visible in your own device unlock logs** (`/v1.1/devices/{id}/door-lock/open-logs`): successful keypad unlocks happen all day, the last one each evening around ~20:00, then **zero successful PIN unlocks for the entire night**, resuming in the morning around ~08:00. This pattern repeats every day.

This strongly suggests our API-created passwords are validated **online** (against the cloud) and therefore fail when the device's cloud session degrades at night, while the app-created passwords are validated **locally** by the controller and keep working.

## We reproduced it manually with Postman (proves it is NOT our code)

At night, during the failure window, we manually fired a single, correctly-signed `PUT /v1.0/devices/{id}/door-lock/actions/entry` for an existing member's PIN. The API returned **`success: true`**, and the device's own logs show the resulting `unlock_method_create` DP report at the same minute (so **the device received and registered the credential, even at night**). Despite this, **the keypad still rejected the PIN.** The exact same PIN works fine during the day. So this is not a signing/encryption/delivery issue on our side — the controller simply does not validate `actions/entry` credentials locally at night, while it does validate app-created (`user_type: 20`) credentials at the same moment.

We also observed the device performing a full internal rebuild of its password table at night (~80 `unlock_method_create` reports in a few seconds), after which our codes are still rejected.

## How our backend creates a PIN today (the codes that fail at night)

1. `POST /v1.0/devices/{device_id}/user` → create user
2. `POST /v1.0/devices/{device_id}/door-lock/password-ticket`
3. AES-decrypt `ticket_key`, AES-encrypt the PIN
4. `PUT /v1.0/devices/{device_id}/door-lock/actions/entry` with `user_type: 2, unlock_type: "password", password_type: "ticket"`

Notes:
- `actions/entry` only accepts `user_type` **1 or 2**. Values 0/10/20 return `1109 param is illegal`. So we cannot create a `user_type: 20` password (the kind the app creates and that works at night) through this endpoint.

## What we already tried

- **Access Control Service** APIs `POST /v1.0/access-control/{device_id}/persons/{person_id}` and `.../passpwd/{pass_pwd}` return **`1106 permission deny`** (not `1108`), even though **"Smart Access Control Service" is authorized** on our project.
- `GET /v1.0/devices/{device_id}/door-lock/opmodes/{user_id}` returns **`28841106 No permissions. This API is not subscribed`**.

## Two real users on the device you can compare directly (same device, side by side)

We left both of these on the device so you can inspect them on your side:

| | Created via | user_id | PIN | Works at night? |
|---|---|---|---|---|
| **WORKING** | Tuya Smart app | `540xdy` ("Esempio di prova") | `252858` | ✅ yes — opens 24/7 |
| **BROKEN** | our Cloud API (`actions/entry`, `user_type: 2`) | `54emze` | `474747` | ❌ no — rejected ~20:00–08:00 |

Both users show `user_type` permanent in their records, yet only the app-created one (`540xdy`, `user_type: 20`) is accepted by the keypad at night. **Please compare what is different between `540xdy` and `54emze` at the device/credential level** — that difference is exactly our bug.

(We also have other API-created test users with the same broken behavior if helpful.)

## Project / Device details

- Cloud project: **"House of Muscle"** (data center: Central Europe — `openapi.tuyaeu.com`)
- Device ID: **`bf38d4d722d26342b0x6vp`**
- Model: **F22-WRB1**, category **`mk`** (WiFi standalone access controller / keypad)
- Authorized services (7): IoT Core, Authorization Token Management, Smart Home Basic Service, Data Dashboard Service, Smart Home Scene Linkage, **Smart Lock Open Service**, **Smart Access Control Service**.

## What we need from you

1. **Which Cloud API should we use to create a PERMANENT password on this `mk` device that the controller validates LOCALLY** (i.e. the exact equivalent of what the Tuya Smart app does — the `user_type: 20` passwords that work 24/7), so it keeps working at night?
2. If it is the Access Control Service (`/v1.0/access-control/.../passpwd/...`), **why does it return `1106 permission deny`** on this device despite the service being authorized, and **how do we enable it** (project authorization / asset binding / device requirements)?
3. Are passwords created via `door-lock/actions/entry` validated **online vs offline**? Is there a per-password flag to make them **offline / local-permanent**?

Our goal: provision ~165 permanent member PINs automatically from our backend that work 24/7 on this keypad, exactly like the app-created ones.
