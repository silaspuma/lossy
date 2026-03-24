import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Song } from "@/lib/types";
import { getObjectUrl, getSpacesBasePrefix, listObjectsInSpacesPrefix } from "@/lib/spaces";

const BUNDLED_MANIFEST_PATH = path.join(process.cwd(), "manifest.json");
const MANIFEST_PATH = process.env.VERCEL ? "/tmp/manifest.json" : BUNDLED_MANIFEST_PATH;
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const COMMON_COVER_NAMES = new Set(["cover", "folder", "front", "artwork", "album"]);

export function getManifestPath() {
  return MANIFEST_PATH;
}

export async function ensureManifestExists() {
  try {
    await fs.access(MANIFEST_PATH);
  } catch {
    if (MANIFEST_PATH !== BUNDLED_MANIFEST_PATH) {
      try {
        const bundled = await fs.readFile(BUNDLED_MANIFEST_PATH, "utf8");
        await fs.writeFile(MANIFEST_PATH, bundled, "utf8");
        return;
      } catch {
        await fs.writeFile(MANIFEST_PATH, "[]\n", "utf8");
        return;
      }
    }

    await fs.writeFile(MANIFEST_PATH, "[]\n", "utf8");
  }
}

export async function readManifest(): Promise<Song[]> {
  await ensureManifestExists();
  const content = await fs.readFile(MANIFEST_PATH, "utf8");

  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as Song[];
  } catch {
    return [];
  }
}

export async function writeManifest(songs: Song[]) {
  await ensureManifestExists();
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(songs, null, 2)}\n`, "utf8");
}

export async function appendSongToManifest(song: Song) {
  const songs = await readManifest();
  songs.push(song);
  await writeManifest(songs);
}

export async function syncManifestWithSpaces() {
  console.log("[manifest:sync] start");
  const songs = await readManifest();
  const keys = await listObjectsInSpacesPrefix();
  console.log("[manifest:sync] source", { manifestCount: songs.length, objectCount: keys.length });

  const imageExactKeys = new Map<string, string>();
  const imageDirFallback = new Map<string, string>();
  for (const key of keys) {
    const ext = path.posix.extname(key).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      continue;
    }
    const dir = path.posix.dirname(key).toLowerCase();
    const base = path.posix.basename(key, ext).toLowerCase();

    const exactKey = `${dir}|${base}`;
    if (!imageExactKeys.has(exactKey)) {
      imageExactKeys.set(exactKey, key);
    }

    if (!imageDirFallback.has(dir) || COMMON_COVER_NAMES.has(base)) {
      imageDirFallback.set(dir, key);
    }
  }

  const existingAudioKeys = new Set(
    songs
      .map((song) => song.audioKey || getKeyFromUrl(song.audioUrl))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())
  );

  let added = 0;
  let updated = 0;
  const nextSongs: Song[] = songs.map((song) => {
    const audioKey = song.audioKey || getKeyFromUrl(song.audioUrl);
    if (!audioKey) {
      return song;
    }

    const inferred = inferFromAudioKey(audioKey);
    const inferredArtworkKey =
      findArtworkKeyForAudio(audioKey, imageExactKeys, imageDirFallback) || song.artworkKey || undefined;

    const nextSong: Song = {
      ...song,
      audioKey: song.audioKey || audioKey,
      title: isUnknownText(song.title) ? inferred.title : song.title,
      artist: isUnknownText(song.artist) ? inferred.artist : song.artist,
      album: isUnknownText(song.album) ? inferred.album : song.album,
      artworkKey: song.artworkKey || inferredArtworkKey,
      artworkUrl: song.artworkUrl || (inferredArtworkKey ? getObjectUrl(inferredArtworkKey) : null)
    };

    if (
      nextSong.audioKey !== song.audioKey ||
      nextSong.title !== song.title ||
      nextSong.artist !== song.artist ||
      nextSong.album !== song.album ||
      nextSong.artworkKey !== song.artworkKey ||
      nextSong.artworkUrl !== song.artworkUrl
    ) {
      updated += 1;
    }

    return nextSong;
  });

  for (const key of keys) {
    const ext = path.posix.extname(key).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      continue;
    }

    if (existingAudioKeys.has(key.toLowerCase())) {
      continue;
    }

    const inferred = inferFromAudioKey(key);
    const artworkKey = findArtworkKeyForAudio(key, imageExactKeys, imageDirFallback);

    nextSongs.push({
      id: `song-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`,
      title: inferred.title,
      artist: inferred.artist,
      album: inferred.album,
      audioUrl: getObjectUrl(key),
      artworkUrl: artworkKey ? getObjectUrl(artworkKey) : null,
      audioKey: key,
      artworkKey
    });

    existingAudioKeys.add(key.toLowerCase());
    added += 1;
  }

  if (added > 0 || updated > 0) {
    await writeManifest(nextSongs);
  }

  console.log("[manifest:sync] done", { added, updated, total: nextSongs.length });

  return {
    added,
    total: nextSongs.length,
    songs: nextSongs
  };
}

function humanizeTitle(input: string) {
  const clean = input
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean || "Untitled";
}

function findArtworkKeyForAudio(
  audioKey: string,
  exactMap: Map<string, string>,
  dirFallback: Map<string, string>
) {
  const ext = path.posix.extname(audioKey);
  const base = path.posix.basename(audioKey, ext).toLowerCase();
  const dir = path.posix.dirname(audioKey).toLowerCase();
  return exactMap.get(`${dir}|${base}`) || dirFallback.get(dir);
}

function inferFromAudioKey(audioKey: string) {
  const ext = path.posix.extname(audioKey);
  const fileBase = path.posix.basename(audioKey, ext);
  const dirParts = path.posix.dirname(audioKey).split("/").filter(Boolean);
  const prefix = getSpacesBasePrefix().toLowerCase();
  const normalizedParts =
    dirParts.length > 0 && dirParts[0].toLowerCase() === prefix ? dirParts.slice(1) : dirParts;

  let title = humanizeTitle(fileBase);
  let artist = "Unknown Artist";
  let album = "Unknown Album";

  const dashMatch = fileBase.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) {
    artist = humanizeTitle(dashMatch[1]);
    title = humanizeTitle(dashMatch[2]);
  }

  if (normalizedParts.length >= 2) {
    artist = humanizeTitle(normalizedParts[normalizedParts.length - 2]);
    album = humanizeTitle(normalizedParts[normalizedParts.length - 1]);
  } else if (normalizedParts.length === 1) {
    album = humanizeTitle(normalizedParts[0]);
  }

  return { title, artist, album };
}

function isUnknownText(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === "unknown artist" || normalized === "unknown album";
}

function getKeyFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return undefined;
  }
}
