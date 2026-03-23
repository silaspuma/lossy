import { NextResponse } from "next/server";
import { syncManifestWithSpaces } from "@/lib/manifest";
import { getSpacesDebugContext } from "@/lib/spaces";

export const runtime = "nodejs";

export async function POST() {
  try {
    console.log("[api:reload] request", getSpacesDebugContext());
    const result = await syncManifestWithSpaces();
    console.log("[api:reload] success", { added: result.added, total: result.total });
    return NextResponse.json({ added: result.added, total: result.total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reload error";
    console.error("[api:reload] error", { message, error });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
