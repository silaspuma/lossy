const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2/release-group/";
const COVER_ART_ARCHIVE_BASE = "https://coverartarchive.org/release-group";
const USER_AGENT = "lossy-cover-fallback/1.0 (self-hosted)";
const MUSICBRAINZ_TIMEOUT_MS = 2500;
const COVER_ART_TIMEOUT_MS = 3000;

type ReleaseGroupSearchPayload = {
  "release-groups"?: Array<{ id?: string }>;
};

export async function fetchCoverArtArchiveImage(input: {
  artist?: string | null;
  album?: string | null;
  title?: string | null;
}) {
  const artist = cleanSearchText(input.artist);
  const album = cleanSearchText(input.album);
  const title = cleanSearchText(input.title);

  if (!artist || (!album && !title)) {
    return undefined;
  }

  const releaseGroupId = await findReleaseGroupId({ artist, album, title });
  if (!releaseGroupId) {
    return undefined;
  }

  const coverUrl = `${COVER_ART_ARCHIVE_BASE}/${encodeURIComponent(releaseGroupId)}/front`;
  const response = await fetchWithTimeout(coverUrl, COVER_ART_TIMEOUT_MS, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store"
  });

  if (!response || !response.ok) {
    return undefined;
  }

  const contentType = normalizeImageContentType(response.headers.get("content-type"));
  if (!contentType) {
    return undefined;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    return undefined;
  }

  return {
    bytes,
    contentType,
    releaseGroupId
  };
}

async function findReleaseGroupId(input: { artist: string; album?: string; title?: string }) {
  const queries = buildSearchQueries(input);

  for (const query of queries) {
    const url = `${MUSICBRAINZ_BASE}?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
    const response = await fetchWithTimeout(url, MUSICBRAINZ_TIMEOUT_MS, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store"
    });

    if (!response || !response.ok) {
      continue;
    }

    const payload = (await response.json()) as ReleaseGroupSearchPayload;
    const id = payload["release-groups"]?.[0]?.id;
    if (id) {
      return id;
    }
  }

  return undefined;
}

function buildSearchQueries(input: { artist: string; album?: string; title?: string }) {
  const queries: string[] = [];

  if (input.album) {
    queries.push(`releasegroup:${input.album} AND artist:${input.artist} AND primarytype:album`);
  }

  if (input.title) {
    queries.push(`releasegroup:${input.title} AND artist:${input.artist} AND primarytype:album`);
  }

  return queries;
}

function normalizeImageContentType(value: string | null) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("image/png")) {
    return "image/png";
  }
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) {
    return "image/jpeg";
  }
  return undefined;
}

function cleanSearchText(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "unknown artist" || lower === "unknown album" || lower === "untitled") {
    return undefined;
  }

  return trimmed;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
