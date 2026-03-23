# Lossy

Minimal self-hosted music streaming app built with Next.js App Router.

All media files are stored in DigitalOcean Spaces. The repository stores metadata only in `manifest.json`.

## Features

- Single-page player on `/`
- Hidden upload page on `/upload`
- Upload API sends MP3 + artwork directly to DigitalOcean Spaces
- `manifest.json` stores song metadata and Spaces URLs
- Optional signed playback/image URLs for private Spaces

## Project Structure

```text
/project-root
  /app
    /api
      /songs
      /upload
      /reload
    /upload
  /components
  /lib
  manifest.json
  .env.example
```

## Environment Setup

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

Required variables:

- `SPACES_ENDPOINT` example: `nyc3.digitaloceanspaces.com`
- `SPACES_REGION` usually `us-east-1` for Spaces SDK compatibility
- `SPACES_BUCKET` your Space name
- `SPACES_KEY` Spaces access key
- `SPACES_SECRET` Spaces secret key

Optional variables:

- `SPACES_BASE_PREFIX=all music`
- `SPACES_USE_SIGNED_URLS=true|false`
- `SPACES_SIGNED_URL_EXPIRES_SECONDS=900`
- `SPACES_UPLOAD_PUBLIC_READ=true|false`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm run dev
```

3. Open:

- Main page: `http://localhost:3000/`
- Upload page: `http://localhost:3000/upload`

## APIs

- `GET /api/songs`
  - Reads `manifest.json`
  - Returns song metadata with URLs for artwork/audio
  - If signed URLs are enabled, returns short-lived signed URLs

- `POST /api/upload`
  - Accepts MP3 + artwork + title/artist/album
  - Uploads files to Spaces
  - Appends metadata + URLs to `manifest.json`

- `POST /api/reload`
  - Re-reads manifest and returns current total count

## Manifest Format

`manifest.json` stores metadata and Spaces URLs only:

```json
[
  {
    "id": "song-1",
    "title": "Song Title",
    "artist": "Artist Name",
    "album": "Album Name",
    "audioUrl": "https://your-space.nyc3.digitaloceanspaces.com/music/song-1.mp3",
    "artworkUrl": "https://your-space.nyc3.digitaloceanspaces.com/artwork/song-1.jpg",
    "audioKey": "music/song-1.mp3",
    "artworkKey": "artwork/song-1.jpg"
  }
]
```

`audioKey` and `artworkKey` are used to generate signed URLs when private mode is enabled.

## DigitalOcean Spaces CORS

Add a CORS rule in your Space settings that allows your app origin to fetch audio and images.

Example CORS policy:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range"],
    "MaxAgeSeconds": 3000
  }
]
```

For production, replace localhost origin with your deployed domain.
