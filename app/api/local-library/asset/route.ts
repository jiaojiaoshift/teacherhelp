import { NextResponse } from "next/server";

import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const assetId = new URL(request.url).searchParams.get("id")?.trim();

  if (!assetId) {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  }

  try {
    const asset = await new LocalLibraryFilesystemRepository().readAsset(assetId);

    if (!asset) {
      return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
    }

    const responseBody = Uint8Array.from(asset.data);

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  }
}
