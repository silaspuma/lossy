import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  appendSongToManifest,
  ensureManifestExists,
  ensureUniqueFileName,
  getMusicDirPath
} from "@/lib/manifest";
import type { Song } from "@/lib/types";

export const runtime = "nodejs";

const allowedAudioTypes = new Set(["audio/mpeg"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png"]);

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value) && typeof value !== "string";
}

export async function POST(request: Request) {
  try {
    await ensureManifestExists();
    const formData = await request.formData();

    const mp3 = formData.get("mp3");
    const artwork = formData.get("artwork");
    const title = String(formData.get("title") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const album = String(formData.get("album") ?? "").trim();

    if (!isFile(mp3) || !isFile(artwork)) {
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    if (!allowedAudioTypes.has(mp3.type)) {
      return NextResponse.json({ error: "MP3 file is required" }, { status: 400 });
    }

    if (!allowedImageTypes.has(artwork.type)) {
      return NextResponse.json({ error: "Artwork must be JPG or PNG" }, { status: 400 });
    }

    if (!title || !artist || !album) {
      return NextResponse.json({ error: "Title, artist, and album are required" }, { status: 400 });
    }

    const musicDir = getMusicDirPath();

    const mp3Name = await ensureUniqueFileName(mp3.name || `${randomUUID()}.mp3`);
    const artExt = path.extname(artwork.name || "").toLowerCase() || ".jpg";
    const artBase = path.basename(artwork.name || randomUUID(), artExt);
    const artName = await ensureUniqueFileName(`${artBase}${artExt}`);

    const [mp3Buffer, artBuffer] = await Promise.all([mp3.arrayBuffer(), artwork.arrayBuffer()]);

    await Promise.all([
      fs.writeFile(path.join(musicDir, mp3Name), Buffer.from(mp3Buffer)),
      fs.writeFile(path.join(musicDir, artName), Buffer.from(artBuffer))
    ]);

    const song: Song = {
      id: randomUUID(),
      file: mp3Name,
      title,
      artist,
      album,
      artwork: artName
    };

    await appendSongToManifest(song);

    return NextResponse.json({ message: "Upload successful", song });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
