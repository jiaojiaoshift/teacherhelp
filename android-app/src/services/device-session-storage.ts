import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MobileUploadPairingQrPayload } from "../domain/upload-types";

const DEVICE_ID_STORAGE_KEY = "teachhelper.mobileUpload.deviceId";
const PAIRING_PAYLOAD_STORAGE_KEY = "teachhelper.mobileUpload.pairingPayload";

export async function loadStoredDeviceId() {
  return await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
}

export async function saveStoredDeviceId(deviceId: string) {
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
}

export async function loadStoredPairingPayload() {
  const rawValue = await AsyncStorage.getItem(PAIRING_PAYLOAD_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as MobileUploadPairingQrPayload;
}

export async function saveStoredPairingPayload(
  payload: MobileUploadPairingQrPayload
) {
  await AsyncStorage.setItem(PAIRING_PAYLOAD_STORAGE_KEY, JSON.stringify(payload));
}

export async function clearStoredPairingPayload() {
  await AsyncStorage.removeItem(PAIRING_PAYLOAD_STORAGE_KEY);
}
