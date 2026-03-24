import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseBuffer } from "music-metadata";
import { fetchCoverArtArchiveImage } from "@/lib/cover-art";
import { appendSongToManifest, ensureManifestExists } from "@/lib/manifest";
import { buildSpacesObjectKey, uploadToSpaces } from "@/lib/spaces";
import type { Song } from "@/lib/types";

export const runtime = "nodejs";

const allowedAudioTypes = new Set(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "video/mp4"]);
const allowedAudioExtensions = new Set([".mp3", ".m4a"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png"]);

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value) && typeof value !== "string";
}

export async function POST(request: Request) {
  try {
    await ensureManifestExists();
    const formData = await request.formData();

    const audio = formData.get("audio") ?? formData.get("mp3");
    const artwork = formData.get("artwork");
    const title = String(formData.get("title") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const album = String(formData.get("album") ?? "").trim();

    if (!isFile(audio)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    if (!isAllowedAudioFile(audio)) {
      return NextResponse.json({ error: "Audio file must be .mp3 or .m4a" }, { status: 400 });
    }

    if (isFile(artwork) && !allowedImageTypes.has(artwork.type)) {
      return NextResponse.json({ error: "Artwork must be JPG or PNG" }, { status: 400 });
    }

    const id = randomUUID();
    const audioExt = normalizeAudioExtension(audio.name, audio.type);
    const safeAudioName = sanitizeKeyPart(path.basename(audio.name || `${id}${audioExt}`, path.extname(audio.name || audioExt)));
    const audioKey = buildSpacesObjectKey(`${id}-${safeAudioName}${audioExt}`);

    const audioBuffer = new Uint8Array(await audio.arrayBuffer());
    const extracted = await extractAudioMetadata(audioBuffer, audioExt);
    const inferred = inferFromFileName(audio.name);

    const resolvedTitle = coalesceText(title, extracted.title, inferred.title, "Untitled");
    const resolvedArtist = coalesceText(artist, extracted.artist, inferred.artist, "Unknown Artist");
    const resolvedAlbum = coalesceText(album, extracted.album, inferred.album, "Unknown Album");

    const coverArtFallback = !isFile(artwork) && !extracted.picture
      ? await fetchCoverArtArchiveImage({
          artist: resolvedArtist,
          album: resolvedAlbum,
          title: resolvedTitle
        })
      : undefined;

    const uploadedArtwork = await resolveArtworkUpload({
      id,
      artwork,
      extractedPicture: extracted.picture,
      coverArtArchive: coverArtFallback
    });

    const [audioUrl] = await Promise.all([
      uploadToSpaces({
        key: audioKey,
        body: audioBuffer,
        contentType: contentTypeForAudio(audio.type, audioExt)
      })
    ]);

    const song: Song = {
      id,
      title: resolvedTitle,
      artist: resolvedArtist,
      album: resolvedAlbum,
      audioUrl,
      artworkUrl: uploadedArtwork?.url ?? null,
      audioKey,
      artworkKey: uploadedArtwork?.key
    };

    await appendSongToManifest(song);

    return NextResponse.json({ message: "Upload successful", song });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

function isAllowedAudioFile(file: File) {
  const ext = path.extname(file.name || "").toLowerCase();
  return allowedAudioTypes.has(file.type) || allowedAudioExtensions.has(ext);
}

function normalizeAudioExtension(name: string, mimeType: string) {
  const ext = path.extname(name || "").toLowerCase();
  if (allowedAudioExtensions.has(ext)) {
    return ext;
  }

  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a" || mimeType === "video/mp4") {
    return ".m4a";
  }

  return ".mp3";
}

function contentTypeForAudio(mimeType: string, ext: string) {
  if (allowedAudioTypes.has(mimeType)) {
    if (mimeType === "video/mp4") {
      return "audio/mp4";
    }
    return mimeType;
  }
  return ext === ".m4a" ? "audio/mp4" : "audio/mpeg";
}

function inferFromFileName(fileName: string) {
  const baseName = path.basename(fileName || "", path.extname(fileName || ""));
  const cleaned = baseName
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const fallbackTitle = cleaned || "Untitled";
  const dashMatch = cleaned.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim() || "Unknown Artist",
      title: dashMatch[2].trim() || fallbackTitle,
      album: "Unknown Album"
    };
  }

  return {
    title: fallbackTitle,
    artist: "Unknown Artist",
    album: "Unknown Album"
  };
}

async function extractAudioMetadata(audioData: Uint8Array, ext: string) {
  try {
    const metadata = await parseBuffer(Buffer.from(audioData), {
      mimeType: ext === ".m4a" ? "audio/mp4" : "audio/mpeg"
    });

    return {
      title: cleanText(metadata.common.title),
      artist: cleanText(metadata.common.artist || metadata.common.artists?.[0]),
      album: cleanText(metadata.common.album),
      picture: metadata.common.picture?.[0]
    };
  } catch {
    return {
      title: undefined,
      artist: undefined,
      album: undefined,
      picture: undefined
    };
  }
}

function cleanText(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}

function coalesceText(...values: Array<string | undefined>) {
  for (const value of values) {
    const clean = cleanText(value);
    if (clean) {
      return clean;
    }
  }

  return "";
}

async function resolveArtworkUpload(input: {
  id: string;
  artwork: FormDataEntryValue | null;
  extractedPicture: { data: Uint8Array; format?: string } | undefined;
  coverArtArchive?: { bytes: Uint8Array; contentType: string; releaseGroupId: string };
}) {
  if (isFile(input.artwork)) {
    const artworkExt = input.artwork.type === "image/png" ? "png" : "jpg";
    const safeArtName = sanitizeKeyPart(
      path.basename(input.artwork.name || `${input.id}.jpg`, path.extname(input.artwork.name || ".jpg"))
    );
    const key = buildSpacesObjectKey(`${input.id}-${safeArtName}.${artworkExt}`);
    const url = await uploadToSpaces({
      key,
      body: new Uint8Array(await input.artwork.arrayBuffer()),
      contentType: input.artwork.type
    });
    return { key, url };
  }

  if (input.extractedPicture) {
    const ext = imageExtFromFormat(input.extractedPicture.format);
    if (!ext) {
      return undefined;
    }

    const key = buildSpacesObjectKey(`${input.id}-embedded-artwork${ext}`);
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    const url = await uploadToSpaces({
      key,
      body: input.extractedPicture.data,
      contentType
    });
    return { key, url };
  }

  if (input.coverArtArchive) {
    const ext = input.coverArtArchive.contentType === "image/png" ? ".png" : ".jpg";
    const key = buildSpacesObjectKey(`${input.id}-cover-art-archive-${input.coverArtArchive.releaseGroupId}${ext}`);
    const url = await uploadToSpaces({
      key,
      body: input.coverArtArchive.bytes,
      contentType: input.coverArtArchive.contentType
    });
    return { key, url };
  }

  return undefined;
}

function imageExtFromFormat(format: string | undefined) {
  if (!format) {
    return undefined;
  }

  const value = format.toLowerCase();
  if (value.includes("png")) {
    return ".png";
  }
  if (value.includes("jpeg") || value.includes("jpg")) {
    return ".jpg";
  }
  return undefined;
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
