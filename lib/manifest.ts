import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Song } from "@/lib/types";
import { getObjectUrl, listObjectsInSpacesPrefix } from "@/lib/spaces";

const BUNDLED_MANIFEST_PATH = path.join(process.cwd(), "manifest.json");
const MANIFEST_PATH = process.env.VERCEL ? "/tmp/manifest.json" : BUNDLED_MANIFEST_PATH;
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

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

  const imageKeys = new Map<string, string>();
  for (const key of keys) {
    const ext = path.posix.extname(key).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      continue;
    }
    const base = path.posix.basename(key, ext).toLowerCase();
    if (!imageKeys.has(base)) {
      imageKeys.set(base, key);
    }
  }

  const existingAudioKeys = new Set(
    songs
      .map((song) => song.audioKey || getKeyFromUrl(song.audioUrl))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())
  );

  let added = 0;
  const nextSongs = [...songs];

  for (const key of keys) {
    const ext = path.posix.extname(key).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      continue;
    }

    if (existingAudioKeys.has(key.toLowerCase())) {
      continue;
    }

    const base = path.posix.basename(key, ext);
    const artworkKey = imageKeys.get(base.toLowerCase());

    nextSongs.push({
      id: `song-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`,
      title: humanizeTitle(base),
      artist: "Unknown Artist",
      album: "Unknown Album",
      audioUrl: getObjectUrl(key),
      artworkUrl: artworkKey ? getObjectUrl(artworkKey) : null,
      audioKey: key,
      artworkKey
    });

    existingAudioKeys.add(key.toLowerCase());
    added += 1;
  }

  if (added > 0) {
    await writeManifest(nextSongs);
  }

  console.log("[manifest:sync] done", { added, total: nextSongs.length });

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

function getKeyFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return undefined;
  }
}
