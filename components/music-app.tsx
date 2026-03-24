"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "@/lib/types";

type SongWithUrls = Song & {
  audioUrl: string;
  artworkUrl: string | null;
};

function PlayIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h2v14H6zM9 12l9 7V5z" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 5h2v14h-2zM6 5v14l9-7z" fill="currentColor" />
    </svg>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainder}`;
}

export default function MusicApp() {
  const [songs, setSongs] = useState<SongWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [brokenArtwork, setBrokenArtwork] = useState<Set<string>>(new Set());
  const [reloadPending, setReloadPending] = useState(false);
  const [reloadMessage, setReloadMessage] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 120);

    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/songs", { cache: "no-store" });
      const payload = (await response.json()) as Song[] | { error?: string };

      if (!response.ok) {
        const message = "error" in payload ? payload.error || "Failed to load songs" : "Failed to load songs";
        console.error("[client:songs] failed", { status: response.status, message, payload });
        throw new Error(message);
      }

      const data = payload as Song[];

      const normalized = data.map((song) => ({
        ...song,
        audioUrl: song.audioUrl,
        artworkUrl: song.artworkUrl ?? null
      }));

      setSongs(normalized);

      if (normalized.length > 0) {
        setCurrentSongId((prev) => {
          if (prev && normalized.some((song) => song.id === prev)) {
            return prev;
          }
          return normalized[0].id;
        });
      } else {
        setCurrentSongId(null);
      }
    } catch (error) {
      console.error("[client:songs] error", error);
      setSongs([]);
      setCurrentSongId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSongs();
  }, [fetchSongs]);

  async function reloadLibrary() {
    setReloadPending(true);
    setReloadMessage("");

    try {
      const response = await fetch("/api/reload", { method: "POST" });
      const payload = (await response.json()) as { total?: number; error?: string };

      if (!response.ok) {
        const message = payload.error || "Reload failed";
        console.error("[client:reload] failed", { status: response.status, message, payload });
        throw new Error(message);
      }

      await fetchSongs();
      setReloadMessage(`Reloaded. Total songs: ${payload.total ?? 0}.`);
    } catch (error) {
      console.error("[client:reload] error", error);
      setReloadMessage("Reload failed.");
    } finally {
      setReloadPending(false);
    }
  }

  const filteredSongs = useMemo(() => {
    if (!debouncedQuery) {
      return songs;
    }

    return songs.filter((song) => {
      const haystack = `${song.title} ${song.artist} ${song.album}`.toLowerCase();
      return haystack.includes(debouncedQuery);
    });
  }, [songs, debouncedQuery]);

  const currentSong = useMemo(() => {
    return songs.find((song) => song.id === currentSongId) ?? null;
  }, [songs, currentSongId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (event.code === "Space" && !isTyping) {
        event.preventDefault();
        void togglePlayPause();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) {
      return;
    }

    const shouldAutoplay = isPlaying;
    audio.src = currentSong.audioUrl;
    audio.load();
    setCurrentTime(0);
    setDuration(0);

    if (shouldAutoplay) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [currentSongId]);

  async function playSong(songId: string) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (songId !== currentSongId) {
      setCurrentSongId(songId);
      setIsPlaying(true);
      return;
    }

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    }
  }

  async function togglePlayPause() {
    const audio = audioRef.current;
    if (!audio || !currentSong) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function playPrevious() {
    if (!currentSong || songs.length === 0) {
      return;
    }

    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const index = songs.findIndex((song) => song.id === currentSong.id);
    if (index < 0) {
      return;
    }

    const previousIndex = index === 0 ? songs.length - 1 : index - 1;
    setCurrentSongId(songs[previousIndex].id);
    setIsPlaying(true);
  }

  function playNext() {
    if (!currentSong || songs.length === 0) {
      return;
    }

    const index = songs.findIndex((song) => song.id === currentSong.id);
    if (index < 0) {
      return;
    }

    const nextIndex = index === songs.length - 1 ? 0 : index + 1;
    setCurrentSongId(songs[nextIndex].id);
    setIsPlaying(true);
  }

  function onSeek(value: string) {
    const nextTime = Number(value);
    const audio = audioRef.current;

    if (!audio || Number.isNaN(nextTime)) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <main className="app-shell">
      <audio ref={audioRef} preload="metadata" />

      <header className="top-bar">
        <div className="top-controls">
          <input
            type="search"
            placeholder="Search by title, artist, or album"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search songs"
          />
          <button type="button" className="reload-button" onClick={() => void reloadLibrary()} disabled={reloadPending}>
            {reloadPending ? "Reloading..." : "Reload"}
          </button>
        </div>
        {reloadMessage ? <p className="top-status">{reloadMessage}</p> : null}
      </header>

      <section className="song-list" aria-live="polite">
        {loading ? <p className="info-text">Loading songs...</p> : null}

        {!loading && filteredSongs.length === 0 ? <p className="info-text">No songs found.</p> : null}

        {!loading
          ? filteredSongs.map((song) => {
              const isCurrent = currentSongId === song.id;

              return (
                <button
                  type="button"
                  key={song.id}
                  className={`song-item ${isCurrent ? "active" : ""}`}
                  onClick={() => void playSong(song.id)}
                >
                  {song.artworkUrl && !brokenArtwork.has(song.id) ? (
                    <img
                      src={song.artworkUrl}
                      alt={`${song.title} artwork`}
                      className="song-art"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        setBrokenArtwork((prev) => {
                          const next = new Set(prev);
                          next.add(song.id);
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <div className="song-art-fallback" aria-hidden="true">
                      No Art
                    </div>
                  )}

                  <div className="song-meta">
                    <strong>{song.title}</strong>
                    <span>{song.artist}</span>
                    <small>{song.album}</small>
                  </div>
                </button>
              );
            })
          : null}
      </section>

      <footer className="now-playing">
        <div className="now-art-wrap">
          {currentSong && currentSong.artworkUrl && !brokenArtwork.has(currentSong.id) ? (
            <img
              src={currentSong.artworkUrl}
              alt={currentSong.title}
              className="now-art"
              onError={(event) => {
                event.currentTarget.onerror = null;
                setBrokenArtwork((prev) => {
                  const next = new Set(prev);
                  next.add(currentSong.id);
                  return next;
                });
              }}
            />
          ) : (
            <div className="song-art-fallback now-art-fallback" aria-hidden="true">
              No Art
            </div>
          )}
        </div>

        <div className="now-meta">
          <strong>{currentSong?.title ?? "Nothing playing"}</strong>
          <span>{currentSong ? `${currentSong.artist}` : ""}</span>
        </div>

        <div className="transport-controls">
          <button
            type="button"
            className="transport-button"
            onClick={playPrevious}
            disabled={!currentSong}
            aria-label="Previous"
            title="Previous"
          >
            <PreviousIcon />
          </button>
          <button
            type="button"
            className="play-toggle"
            onClick={() => void togglePlayPause()}
            disabled={!currentSong}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="transport-button"
            onClick={playNext}
            disabled={!currentSong}
            aria-label="Next"
            title="Next"
          >
            <NextIcon />
          </button>
        </div>

        <div className="progress-wrap">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => onSeek(event.target.value)}
            step="0.1"
            disabled={!currentSong || duration === 0}
            aria-label="Seek audio"
          />
          <span>{formatTime(duration)}</span>
        </div>
      </footer>
    </main>
  );
}
