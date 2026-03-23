import { NextResponse } from "next/server";
import { readManifest } from "@/lib/manifest";
import { getPlaybackUrl } from "@/lib/spaces";

export const runtime = "nodejs";

export async function GET() {
  const songs = await readManifest();
  const hydrated = await Promise.all(
    songs.map(async (song) => ({
      ...song,
      audioUrl: await getPlaybackUrl({ key: song.audioKey, fallbackUrl: song.audioUrl }),
      artworkUrl: song.artworkUrl
        ? await getPlaybackUrl({ key: song.artworkKey, fallbackUrl: song.artworkUrl })
        : undefined
    }))
  );

  return NextResponse.json(hydrated);
}
