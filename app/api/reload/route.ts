import { NextResponse } from "next/server";
import { syncManifestWithSpaces } from "@/lib/manifest";

export const runtime = "nodejs";

export async function POST() {
  const result = await syncManifestWithSpaces();
  return NextResponse.json({ added: result.added, total: result.total });
}
