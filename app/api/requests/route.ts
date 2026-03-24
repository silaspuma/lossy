import { NextResponse } from "next/server";
import { createRequests, getRequests } from "@/lib/request-store";
import type { AlbumSearchResult } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const requests = await getRequests();
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { albums?: AlbumSearchResult[] };
    const albums = Array.isArray(body.albums) ? body.albums.slice(0, 3) : [];

    if (albums.length === 0) {
      return NextResponse.json({ error: "Select at least one album" }, { status: 400 });
    }

    const sanitized = albums
      .filter((album) => album && album.id && album.title)
      .map((album) => ({
        id: album.id,
        title: album.title,
        artist: album.artist || "Unknown Artist",
        year: album.year
      }));

    if (sanitized.length === 0) {
      return NextResponse.json({ error: "No valid albums provided" }, { status: 400 });
    }

    const created = await createRequests(sanitized);
    return NextResponse.json({ createdCount: created.length });
  } catch {
    return NextResponse.json({ error: "Failed to create requests" }, { status: 500 });
  }
}
