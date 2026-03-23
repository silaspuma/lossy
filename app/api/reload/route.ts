import { NextResponse } from "next/server";
import { readManifest } from "@/lib/manifest";

export const runtime = "nodejs";

export async function POST() {
  const songs = await readManifest();
  return NextResponse.json({ total: songs.length });
}
