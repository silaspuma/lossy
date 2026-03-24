import { NextResponse } from "next/server";
import { readManifest, syncManifestWithSpaces } from "@/lib/manifest";
import { getPlaybackUrl, getSpacesDebugContext } from "@/lib/spaces";

export const runtime = "nodejs";

export async function GET() {
  try {
    console.log("[api:songs] request", getSpacesDebugContext());

    const songs = await readManifest();
    let sourceSongs = songs;

    if (songs.length === 0 || shouldPromoteToDeepSync(sourceSongs)) {
      sourceSongs = (await syncManifestWithSpaces()).songs;
    }

    if (shouldRefreshArtworkFromEmbedded(sourceSongs)) {
      console.log("[api:songs] refreshing artwork from embedded metadata", {
        songCount: sourceSongs.length
      });
      sourceSongs = (await syncManifestWithSpaces()).songs;
    }

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

function shouldPromoteToDeepSync(
  songs: Array<{ title?: string; artist?: string; album?: string; artworkKey?: string; artworkUrl?: string | null }>
) {
  if (songs.length === 0) {
    return true;
  }

  const unknownCount = songs.filter(
    (song) => isUnknownText(song.title) || isUnknownText(song.artist) || isUnknownText(song.album)
  ).length;

  return unknownCount > 0;
}

function isUnknownText(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === "unknown artist" || normalized === "unknown album" || normalized === "untitled";
}

function shouldRefreshArtworkFromEmbedded(
  songs: Array<{ artworkKey?: string; artworkUrl?: string | null; audioKey?: string; album?: string }>
) {
  const withAudio = songs.filter((song) => Boolean(song.audioKey));
  if (withAudio.length < 2) {
    return false;
  }

  const artworkKeys = new Set(
    withAudio
      .map((song) => song.artworkKey || getKeyFromUrl(song.artworkUrl))
      .filter((key): key is string => Boolean(key))
  );

  if (artworkKeys.size === 0) {
    return false;
  }

  const albums = new Set(
    withAudio
      .map((song) => song.album?.trim().toLowerCase())
      .filter((album): album is string => Boolean(album))
  );

  if (albums.size >= 2 && artworkKeys.size === 1) {
    const onlyArtworkKey = Array.from(artworkKeys)[0];
    return !isEmbeddedArtworkKey(onlyArtworkKey);
  }

  return false;
}

function isEmbeddedArtworkKey(key: string) {
  return key.split("/").pop()?.startsWith(".embedded-art-") ?? false;
}

function getKeyFromUrl(url: string | null | undefined) {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return undefined;
  }
}
