import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function normalizeEndpoint(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function shouldUseSignedUrls() {
  return process.env.SPACES_USE_SIGNED_URLS === "true";
}

export function signedUrlExpiresInSeconds() {
  const raw = process.env.SPACES_SIGNED_URL_EXPIRES_SECONDS?.trim();
  const parsed = raw ? Number(raw) : 900;
  if (!Number.isFinite(parsed) || parsed < 60) {
    return 900;
  }
  return Math.floor(parsed);
}

export function shouldUploadPublicRead() {
  return process.env.SPACES_UPLOAD_PUBLIC_READ === "true";
}

export function getSpacesBasePrefix() {
  const raw = process.env.SPACES_BASE_PREFIX?.trim();
  const prefix = raw && raw.length > 0 ? raw : "all music";
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function buildSpacesObjectKey(fileName: string) {
  const cleanName = fileName.replace(/^\/+/, "");
  const prefix = getSpacesBasePrefix();
  return prefix ? `${prefix}/${cleanName}` : cleanName;
}

export function getSpacesBucket() {
  return getEnv("SPACES_BUCKET");
}

export function getSpacesEndpointHost() {
  const endpoint = getEnv("SPACES_ENDPOINT");
  return endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function getSpacesClient() {
  return new S3Client({
    endpoint: normalizeEndpoint(getEnv("SPACES_ENDPOINT")),
    region: process.env.SPACES_REGION || "us-east-1",
    credentials: {
      accessKeyId: getEnv("SPACES_KEY"),
      secretAccessKey: getEnv("SPACES_SECRET")
    }
  });
}

export function getObjectUrl(key: string) {
  const bucket = getSpacesBucket();
  const endpointHost = getSpacesEndpointHost();
  return `https://${bucket}.${endpointHost}/${encodeURI(key)}`;
}

export async function uploadToSpaces(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  const client = getSpacesClient();
  const command = new PutObjectCommand({
    Bucket: getSpacesBucket(),
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    ACL: shouldUploadPublicRead() ? "public-read" : undefined
  });

  await client.send(command);
  return getObjectUrl(input.key);
}

export async function getPlaybackUrl(input: { key?: string; fallbackUrl: string }) {
  if (!shouldUseSignedUrls() || !input.key) {
    return input.fallbackUrl;
  }

  const client = getSpacesClient();
  const signed = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getSpacesBucket(),
      Key: input.key
    }),
    { expiresIn: signedUrlExpiresInSeconds() }
  );

  return signed;
}
