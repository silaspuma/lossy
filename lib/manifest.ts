import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseFile } from "music-metadata";
import type { Song } from "@/lib/types";

const MUSIC_DIR = path.join(process.cwd(), "music");
const MANIFEST_PATH = path.join(MUSIC_DIR, "manifest.json");
const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg"]);
const ART_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_ALBUM = "Unknown Album";

export function getMusicDirPath() {
  return MUSIC_DIR;
}

export async function ensureManifestExists() {
  await fs.mkdir(MUSIC_DIR, { recursive: true });

  try {
    await fs.access(MANIFEST_PATH);
  } catch {
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

    if (parsed.length > 0) {
      const existing = parsed as Song[];
      const { songs: enriched, changed } = await enrichExistingSongs(existing);

      if (changed) {
        await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
      }

      return enriched;
    }

    // When users drop files directly into /music, generate a manifest on first read.
    const discovered = await discoverSongsFromMusicDir();
    if (discovered.length > 0) {
      await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(discovered, null, 2)}\n`, "utf8");
    }

    return discovered;
  } catch {
    return [];
  }
}

export async function syncManifestWithMusicDir() {
  await ensureManifestExists();

  const existing = await readManifest();
  const entries = await fs.readdir(MUSIC_DIR);
  const lowerNameMap = new Map(entries.map((name) => [name.toLowerCase(), name]));
  const audioFiles = entries
    .filter((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const existingByFile = new Set(existing.map((song) => song.file.toLowerCase()));

  const withNewSongs = [...existing];
  let added = 0;

  for (const fileName of audioFiles) {
    if (existingByFile.has(fileName.toLowerCase())) {
      continue;
    }

    withNewSongs.push(await buildSongFromFile(fileName, lowerNameMap));
    existingByFile.add(fileName.toLowerCase());
    added += 1;
  }

  const { songs: enriched, changed } = await enrichExistingSongs(withNewSongs, lowerNameMap);

  if (added > 0 || changed) {
    await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
  }

  return {
    added,
    updated: changed,
    total: enriched.length
  };
}

export async function appendSongToManifest(song: Song) {
  const songs = await readManifest();
  songs.push(song);
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(songs, null, 2)}\n`, "utf8");
}

export async function ensureUniqueFileName(fileName: string) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = `${sanitizeName(base)}${ext.toLowerCase()}`;
  let count = 1;

  while (true) {
    try {
      await fs.access(path.join(MUSIC_DIR, candidate));
      candidate = `${sanitizeName(base)}-${count}${ext.toLowerCase()}`;
      count += 1;
    } catch {
      return candidate;
    }
  }
}

function sanitizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "") || "file";
}

async function discoverSongsFromMusicDir(): Promise<Song[]> {
  const entries = await fs.readdir(MUSIC_DIR);
  const lowerNameMap = new Map(entries.map((name) => [name.toLowerCase(), name]));
  const audioFiles = entries
    .filter((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const songs: Song[] = [];

  for (const fileName of audioFiles) {
    songs.push(await buildSongFromFile(fileName, lowerNameMap));
  }

  return songs;
}

async function enrichExistingSongs(existing: Song[], lowerNameMap?: Map<string, string>) {
  const artworkMap = lowerNameMap ?? new Map((await fs.readdir(MUSIC_DIR)).map((name) => [name.toLowerCase(), name]));
  let changed = false;
  const songs: Song[] = [];

  for (const song of existing) {
    const needsEnrichment =
      !song.title ||
      isUnknown(song.artist, UNKNOWN_ARTIST) ||
      isUnknown(song.album, UNKNOWN_ALBUM) ||
      !song.artwork;

    if (!needsEnrichment) {
      songs.push(song);
      continue;
    }

    const ext = path.extname(song.file);
    const base = path.basename(song.file, ext);
    const externalArtwork = findArtworkForBase(base, artworkMap);
    const fileMetadata = await extractAudioMetadata(song.file);

    const next: Song = {
      ...song,
      title: song.title?.trim() || fileMetadata.title || humanizeTitle(base),
      artist: isUnknown(song.artist, UNKNOWN_ARTIST)
        ? fileMetadata.artist || UNKNOWN_ARTIST
        : song.artist,
      album: isUnknown(song.album, UNKNOWN_ALBUM) ? fileMetadata.album || UNKNOWN_ALBUM : song.album,
      artwork: song.artwork || externalArtwork || fileMetadata.artwork
    };

    if (
      next.title !== song.title ||
      next.artist !== song.artist ||
      next.album !== song.album ||
      next.artwork !== song.artwork
    ) {
      changed = true;
    }

    songs.push(next);
  }

  return { songs, changed };
}

async function buildSongFromFile(fileName: string, lowerNameMap: Map<string, string>) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const externalArtwork = findArtworkForBase(base, lowerNameMap);
  const extracted = await extractAudioMetadata(fileName);

  return {
    id: `song-${createHash("sha1").update(fileName).digest("hex").slice(0, 12)}`,
    file: fileName,
    title: extracted.title || humanizeTitle(base),
    artist: extracted.artist || UNKNOWN_ARTIST,
    album: extracted.album || UNKNOWN_ALBUM,
    artwork: externalArtwork || extracted.artwork
  } satisfies Song;
}

function findArtworkForBase(base: string, names: Map<string, string>) {
  for (const ext of ART_EXTENSIONS) {
    const candidate = `${base}${ext}`.toLowerCase();
    const resolved = names.get(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

function humanizeTitle(base: string) {
  const title = base
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return title || "Untitled";
}

function isUnknown(value: string | undefined, fallback: string) {
  return !value || value.trim().length === 0 || value === fallback;
}

async function extractAudioMetadata(fileName: string) {
  try {
    const filePath = path.join(MUSIC_DIR, fileName);
    const metadata = await parseFile(filePath, { skipPostHeaders: true });
    const picture = metadata.common.picture?.[0];

    let artwork: string | undefined;
    if (picture?.data && picture?.format) {
      artwork = await writeEmbeddedArtwork(fileName, picture.data, picture.format);
    }

    return {
      title: cleanText(metadata.common.title),
      artist: cleanText(metadata.common.artist || metadata.common.artists?.[0]),
      album: cleanText(metadata.common.album),
      artwork
    };
  } catch {
    return {};
  }
}

function cleanText(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}

async function writeEmbeddedArtwork(fileName: string, data: Uint8Array, mimeType: string) {
  const ext = extensionFromMimeType(mimeType);
  if (!ext) {
    return undefined;
  }

  const id = createHash("sha1").update(fileName).digest("hex").slice(0, 12);
  const artworkName = `.artwork-${id}${ext}`;
  const fullPath = path.join(MUSIC_DIR, artworkName);

  try {
    await fs.access(fullPath);
    return artworkName;
  } catch {
    await fs.writeFile(fullPath, Buffer.from(data));
    return artworkName;
  }
}

function extensionFromMimeType(mimeType: string) {
  const type = mimeType.toLowerCase();
  if (type.includes("jpeg") || type.includes("jpg")) {
    return ".jpg";
  }
  if (type.includes("png")) {
    return ".png";
  }

  return undefined;
}
