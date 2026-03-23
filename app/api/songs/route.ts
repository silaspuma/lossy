import { NextResponse } from "next/server";
import { readManifest } from "@/lib/manifest";

export const runtime = "nodejs";

export async function GET() {
  const songs = await readManifest();
  return NextResponse.json(songs);
}
