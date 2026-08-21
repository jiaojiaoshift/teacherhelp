import { NextResponse } from "next/server";

import { InvalidTeachHelperSettingsError, TeachHelperSettingsRepository } from "@/lib/server/teachhelper-settings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await new TeachHelperSettingsRepository().loadPublic();
    return NextResponse.json(settings, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "settings_read_failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);

  try {
    const settings = await new TeachHelperSettingsRepository().save(body);
    return NextResponse.json(settings, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof InvalidTeachHelperSettingsError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }

    return NextResponse.json({ error: "settings_write_failed" }, { status: 500 });
  }
}
