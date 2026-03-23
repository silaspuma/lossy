import { promises as fs } from "node:fs";
import path from "node:path";
import { getMusicDirPath } from "@/lib/manifest";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

function safeFilePath(parts: string[]) {
  const musicDir = getMusicDirPath();
  const candidate = path.resolve(musicDir, ...parts);
  if (!candidate.startsWith(path.resolve(musicDir))) {
    return null;
  }
  return candidate;
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const filePath = safeFilePath(parts);

  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";
    const range = request.headers.get("range");

    if (!range) {
      const data = await fs.readFile(filePath);
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(stat.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      return new Response("Invalid range", { status: 416 });
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      return new Response("Invalid range", { status: 416 });
    }

    const file = await fs.open(filePath, "r");
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, start);
    await file.close();

    return new Response(new Uint8Array(buffer), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(length),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
