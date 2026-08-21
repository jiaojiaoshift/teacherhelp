import { NextResponse } from "next/server";

import packageMetadata from "@/package.json";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "teachhelper",
      version: packageMetadata.version
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
