import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

function endpointAlreadyIncludesBucket(endpointHost: string, bucket: string) {
  return endpointHost.toLowerCase().startsWith(`${bucket.toLowerCase()}.`);
}

export function getSpacesClient() {
  const endpoint = normalizeEndpoint(getEnv("SPACES_ENDPOINT"));
  const bucket = getSpacesBucket();
  const endpointHost = endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return new S3Client({
    endpoint,
    region: process.env.SPACES_REGION || "us-east-1",
    forcePathStyle: endpointAlreadyIncludesBucket(endpointHost, bucket),
    credentials: {
      accessKeyId: getEnv("SPACES_KEY"),
      secretAccessKey: getEnv("SPACES_SECRET")
    }
  });
}

export function getObjectUrl(key: string) {
  const bucket = getSpacesBucket();
  const endpointHost = getSpacesEndpointHost();
  if (endpointAlreadyIncludesBucket(endpointHost, bucket)) {
    return `https://${endpointHost}/${encodeURI(key)}`;
  }
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

export async function listObjectsInSpacesPrefix() {
  console.log("[spaces:list] start", getSpacesDebugContext());

  const client = getSpacesClient();
  const bucket = getSpacesBucket();
  const prefix = getSpacesBasePrefix();

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix ? `${prefix}/` : undefined,
        ContinuationToken: continuationToken
      })
    );

    for (const item of response.Contents ?? []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log("[spaces:list] done", { keyCount: keys.length, prefix: prefix || "(root)" });

  return keys;
}

export async function downloadObjectBytesFromSpaces(key: string) {
  const client = getSpacesClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getSpacesBucket(),
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`Missing object body for key: ${key}`);
  }

  const body = response.Body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
  };

  if (typeof body.transformToByteArray === "function") {
    return await body.transformToByteArray();
  }

  if (body[Symbol.asyncIterator]) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return new Uint8Array(Buffer.concat(chunks));
  }

  throw new Error(`Unsupported response body type for key: ${key}`);
}

export function getSpacesDebugContext() {
  const endpoint = process.env.SPACES_ENDPOINT || "(missing)";
  const bucket = process.env.SPACES_BUCKET || "(missing)";
  const region = process.env.SPACES_REGION || "(missing)";
  const prefix = process.env.SPACES_BASE_PREFIX || "all music";

  return {
    endpoint,
    bucket,
    region,
    prefix,
    hasKey: Boolean(process.env.SPACES_KEY),
    hasSecret: Boolean(process.env.SPACES_SECRET),
    signedUrls: shouldUseSignedUrls()
  };
}
