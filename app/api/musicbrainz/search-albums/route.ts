import { NextResponse } from "next/server";
import type { AlbumSearchResult } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const pageRaw = Number(searchParams.get("page") || "0");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;
  const limit = 3;
  const offset = page * limit;

  if (q.length < 2) {
    return NextResponse.json({ albums: [], hasMore: false });
  }

  const query = `releasegroup:${q} AND primarytype:album`;
  const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}&offset=${offset}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "lossy-requests/1.0 (self-hosted)"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json({ error: "MusicBrainz search failed", albums: [], hasMore: false }, { status: 502 });
    }

    const payload = (await response.json()) as {
      count?: number;
      "release-groups"?: Array<{
        id: string;
        title: string;
        "first-release-date"?: string;
        "artist-credit"?: Array<{ name?: string }>;
      }>;
    };

    const albums: AlbumSearchResult[] = (payload["release-groups"] || []).map((group) => ({
      id: group.id,
      title: group.title,
      artist: group["artist-credit"]?.[0]?.name || "Unknown Artist",
      year: group["first-release-date"]?.slice(0, 4),
      coverUrl: `https://coverartarchive.org/release-group/${group.id}/front-250`
    }));

    const totalCount = payload.count || 0;
    const hasMore = offset + albums.length < totalCount;

    return NextResponse.json({ albums, hasMore });
  } catch {
    return NextResponse.json({ error: "MusicBrainz search failed", albums: [], hasMore: false }, { status: 500 });
  }
}
