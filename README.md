# Lossy

Minimal self-hosted music streaming app built with Next.js App Router.

## Features

- Single-page music player UI on `/`
- Hidden upload page on `/upload`
- File-based storage only:
  - Music and artwork files in `/music`
  - Metadata in `/music/manifest.json`
- API routes:
  - `GET /api/songs`
  - `POST /api/upload`
- Music and artwork served from `/music/<filename>`

## Project Structure

```text
/project-root
  /app
    /api
      /songs
      /upload
      /music/[...path]
    /upload
  /components
  /lib
  /music
    manifest.json
```

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open app:

- Main player: `http://localhost:3000/`
- Upload page: `http://localhost:3000/upload`

## Upload Flow

Use `/upload` form to submit:

- MP3 file
- JPG/PNG artwork
- Title
- Artist
- Album

On submit:

- Files are saved into `/music`
- A unique song id is generated
- Entry is appended to `/music/manifest.json`
- Existing entries are preserved

## Notes

- Keep `manifest.json` as a JSON array.
- If artwork is missing/broken, UI falls back to a simple placeholder.
