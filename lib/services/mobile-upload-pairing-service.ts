import type { MobileUploadPairingSessionEntity } from "@/lib/domain/entities";
import { MOBILE_UPLOAD_PAIRING_QR_TYPE } from "@/lib/services/mobile-upload-contract";

function createPairingSessionId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createPairingCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function addMinutes(isoTimestamp: string, minutes: number) {
  return new Date(new Date(isoTimestamp).getTime() + minutes * 60_000).toISOString();
}

export function buildMobileUploadPairingQrPayload(input: {
  helperBaseUrl: string;
  pairingSessionId: string;
  pairingCode: string;
}) {
  return JSON.stringify({
    type: MOBILE_UPLOAD_PAIRING_QR_TYPE,
    helperBaseUrl: input.helperBaseUrl,
    pairingSessionId: input.pairingSessionId,
    pairingCode: input.pairingCode
  });
}

export function createMobileUploadPairingSession(input: {
  helperBaseUrl: string;
  now?: string;
  expiresInMinutes?: number;
  createId?: () => string;
  createPairingCode?: () => string;
}): MobileUploadPairingSessionEntity {
  const now = input.now ?? new Date().toISOString();
  const sessionId = (input.createId ?? (() => createPairingSessionId("mobile-upload-pairing")))();
  const pairingCode = (input.createPairingCode ?? createPairingCode)();

  return {
    id: sessionId,
    helperBaseUrl: input.helperBaseUrl,
    pairingCode,
    qrPayload: buildMobileUploadPairingQrPayload({
      helperBaseUrl: input.helperBaseUrl,
      pairingSessionId: sessionId,
      pairingCode
    }),
    createdAt: now,
    expiresAt: addMinutes(now, input.expiresInMinutes ?? 15),
    pairedDeviceIds: []
  };
}

export function resolveMobileUploadPairingSessionState(
  session: MobileUploadPairingSessionEntity,
  now?: string
) {
  if (new Date(session.expiresAt).getTime() <= new Date(now ?? new Date().toISOString()).getTime()) {
    return "expired" as const;
  }

  return session.pairedDeviceIds.length > 0 ? ("paired" as const) : ("ready" as const);
}

export function registerPairedMobileUploadDevice(input: {
  session: MobileUploadPairingSessionEntity;
  deviceId: string;
}): MobileUploadPairingSessionEntity {
  return input.session.pairedDeviceIds.includes(input.deviceId)
    ? input.session
    : {
        ...input.session,
        pairedDeviceIds: input.session.pairedDeviceIds.concat(input.deviceId)
      };
}
