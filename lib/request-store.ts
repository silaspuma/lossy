import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSpacesBasePrefix, getSpacesBucket, getSpacesClient } from "@/lib/spaces";
import type { AlbumRequest, AlbumSearchResult } from "@/lib/types";

function getRequestsObjectKey() {
  const prefix = getSpacesBasePrefix();
  return prefix ? `${prefix}/.requests.json` : ".requests.json";
}

async function readObjectText(command: GetObjectCommand) {
  const response = await getSpacesClient().send(command);
  if (!response.Body) {
    return "[]";
  }

  const body = response.Body as {
    transformToString?: (encoding?: string) => Promise<string>;
    transformToByteArray?: () => Promise<Uint8Array>;
  };

  if (typeof body.transformToString === "function") {
    return await body.transformToString("utf8");
  }

  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes).toString("utf8");
  }

  return "[]";
}

async function readRequests(): Promise<AlbumRequest[]> {
  try {
    const content = await readObjectText(
      new GetObjectCommand({
        Bucket: getSpacesBucket(),
        Key: getRequestsObjectKey()
      })
    );

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as AlbumRequest[]) : [];
  } catch (error) {
    const code = (error as { name?: string; Code?: string })?.name || (error as { Code?: string })?.Code;
    if (code === "NoSuchKey") {
      return [];
    }

    throw error;
  }
}

async function writeRequests(requests: AlbumRequest[]) {
  await getSpacesClient().send(
    new PutObjectCommand({
      Bucket: getSpacesBucket(),
      Key: getRequestsObjectKey(),
      Body: JSON.stringify(requests, null, 2),
      ContentType: "application/json"
    })
  );
}

export async function getRequests() {
  const requests = await readRequests();
  return requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createRequests(albums: AlbumSearchResult[]) {
  const existing = await readRequests();
  const now = new Date().toISOString();

  const incoming: AlbumRequest[] = albums.slice(0, 3).map((album) => ({
    id: randomUUID(),
    albumId: album.id,
    title: album.title,
    artist: album.artist,
    year: album.year,
    status: "pending",
    createdAt: now
  }));

  const next = [...incoming, ...existing];
  await writeRequests(next);
  return incoming;
}

export async function completeRequest(requestId: string) {
  const existing = await readRequests();
  let changed = false;

  const next = existing.map((request) => {
    if (request.id !== requestId || request.status === "completed") {
      return request;
    }

    changed = true;
    return {
      ...request,
      status: "completed" as const,
      completedAt: new Date().toISOString()
    };
  });

  if (changed) {
    await writeRequests(next);
  }

  return { changed, requests: next };
}
