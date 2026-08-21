import { NextResponse } from "next/server";

import { createMobileUploadPairingSession } from "@/lib/services/mobile-upload-pairing-service";
import {
  getActiveMobileUploadPairingSession,
  setActiveMobileUploadPairingSession
} from "@/lib/server/mobile-upload-helper-state";
import { resolveMobileUploadHelperBaseUrl } from "@/lib/server/mobile-upload-helper-base-url";

export async function GET() {
  return NextResponse.json({
    pairingSession: getActiveMobileUploadPairingSession()
  });
}

export async function POST(request: Request) {
  const pairingSession = setActiveMobileUploadPairingSession(
    createMobileUploadPairingSession({
      helperBaseUrl: resolveMobileUploadHelperBaseUrl({
        requestUrl: request.url
      })
    })
  );

  return NextResponse.json({
    pairingSession
  });
}

