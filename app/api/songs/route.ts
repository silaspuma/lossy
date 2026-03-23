import { NextResponse } from "next/server";
import { readManifest, syncManifestWithSpaces } from "@/lib/manifest";
import { getPlaybackUrl, getSpacesDebugContext } from "@/lib/spaces";

export const runtime = "nodejs";

export async function GET() {
  try {
    console.log("[api:songs] request", getSpacesDebugContext());

    const songs = await readManifest();
    const sourceSongs = songs.length === 0 ? (await syncManifestWithSpaces()).songs : songs;
    const hydrated = await Promise.all(
      sourceSongs.map(async (song) => ({
        ...song,
        audioUrl: await getPlaybackUrl({ key: song.audioKey, fallbackUrl: song.audioUrl }),
        artworkUrl: song.artworkUrl
          ? await getPlaybackUrl({ key: song.artworkKey, fallbackUrl: song.artworkUrl })
          : undefined
      }))
    );

    console.log("[api:songs] success", { count: hydrated.length });
    return NextResponse.json(hydrated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown songs API error";
    console.error("[api:songs] error", { message, error });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
