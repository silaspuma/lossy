import { promises as fs } from "node:fs";
import path from "node:path";
import type { Song } from "@/lib/types";

const MANIFEST_PATH = path.join(process.cwd(), "manifest.json");

export function getManifestPath() {
  return MANIFEST_PATH;
}

export async function ensureManifestExists() {
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
