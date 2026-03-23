import { NextResponse } from "next/server";
import { syncManifestWithMusicDir } from "@/lib/manifest";

export const runtime = "nodejs";

export async function POST() {
  const result = await syncManifestWithMusicDir();
  return NextResponse.json(result);
}
