import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appendSongToManifest, ensureManifestExists } from "@/lib/manifest";
import { uploadToSpaces } from "@/lib/spaces";
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

    const id = randomUUID();
    const safeAudioName = sanitizeKeyPart(path.basename(mp3.name || `${id}.mp3`, path.extname(mp3.name || ".mp3")));
    const safeArtName = sanitizeKeyPart(path.basename(artwork.name || `${id}.jpg`, path.extname(artwork.name || ".jpg")));
    const audioKey = `music/${id}-${safeAudioName}.mp3`;
    const artworkExt = artwork.type === "image/png" ? "png" : "jpg";
    const artworkKey = `artwork/${id}-${safeArtName}.${artworkExt}`;

    const [mp3Buffer, artBuffer] = await Promise.all([mp3.arrayBuffer(), artwork.arrayBuffer()]);

    const [audioUrl, artworkUrl] = await Promise.all([
      uploadToSpaces({
        key: audioKey,
        body: new Uint8Array(mp3Buffer),
        contentType: "audio/mpeg"
      }),
      uploadToSpaces({
        key: artworkKey,
        body: new Uint8Array(artBuffer),
        contentType: artwork.type
      })
    ]);

    const song: Song = {
      id,
      title,
      artist,
      album,
      audioUrl,
      artworkUrl,
      audioKey,
      artworkKey
    };

    await appendSongToManifest(song);

    return NextResponse.json({ message: "Upload successful", song });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

function sanitizeKeyPart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "") || "file"
  );
}
