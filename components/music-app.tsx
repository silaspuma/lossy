"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AlbumSearchResult, Song } from "@/lib/types";

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

function ReloadIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5a7 7 0 1 0 6.32 10h-2.2A5 5 0 1 1 12 7c1.3 0 2.48.5 3.37 1.31L13 11h7V4l-2.1 2.1A8.94 8.94 0 0 0 12 5z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 3h4v4h-2V6.41l-3.29 3.3-1.42-1.42L17.59 5H17V3zM3 7h4.5l3.2 3.2-1.4 1.4L6.7 9H3V7zm11.3 5.4 1.4 1.4L19 10.6V12h2V8h-4v2h.59l-3.29 3.29zM3 17h3.7l10.9-10.9-1.4-1.4L5.3 15.6H3v1.4z"
        fill="currentColor"
      />
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
  const loadingSkeletonCount = 7;
  const [songs, setSongs] = useState<SongWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [brokenArtwork, setBrokenArtwork] = useState<Set<string>>(new Set());
  const [reloadPending, setReloadPending] = useState(false);
  const [reloadMessage, setReloadMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestQuery, setRequestQuery] = useState("");
  const [requestResults, setRequestResults] = useState<AlbumSearchResult[]>([]);
  const [requestPage, setRequestPage] = useState(0);
  const [requestHasMore, setRequestHasMore] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState<AlbumSearchResult[]>([]);
  const [brokenRequestCovers, setBrokenRequestCovers] = useState<Set<string>>(new Set());
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shuffleHistoryRef = useRef<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 120);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setRequestPage(0);
    setBrokenRequestCovers(new Set());
  }, [requestQuery]);

  useEffect(() => {
    if (!requestModalOpen) {
      return;
    }

    const trimmed = requestQuery.trim();
    if (trimmed.length < 2) {
      setRequestResults([]);
      setRequestHasMore(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setRequestLoading(true);
      try {
        const response = await fetch(
          `/api/musicbrainz/search-albums?q=${encodeURIComponent(trimmed)}&page=${requestPage}`
        );
        const payload = (await response.json()) as {
          albums?: AlbumSearchResult[];
          hasMore?: boolean;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Search failed");
        }

        setRequestResults(payload.albums || []);
        setRequestHasMore(Boolean(payload.hasMore));
        setRequestError("");
      } catch (error) {
        setRequestResults([]);
        setRequestHasMore(false);
        setRequestError(error instanceof Error ? error.message : "Search failed");
      } finally {
        setRequestLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [requestModalOpen, requestQuery, requestPage]);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("/api/songs", { cache: "no-store", signal: controller.signal });
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
      if (error instanceof Error && error.name === "AbortError") {
        setLoadError("Loading timed out. Check Spaces connection and try Reload.");
      } else if (error instanceof Error && error.message) {
        setLoadError(error.message);
      } else {
        setLoadError("Failed to load songs.");
      }
      setSongs([]);
      setCurrentSongId(null);
    } finally {
      window.clearTimeout(timeout);
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

  function toggleRequestedAlbum(album: AlbumSearchResult) {
    setSelectedRequests((current) => {
      const exists = current.some((item) => item.id === album.id);
      if (exists) {
        return current.filter((item) => item.id !== album.id);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, album];
    });
  }

  async function submitRequests() {
    if (selectedRequests.length === 0) {
      setRequestError("Select at least one album.");
      return;
    }

    setRequestSubmitting(true);
    setRequestError("");

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albums: selectedRequests.slice(0, 3) })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create request");
      }

      window.location.href = "/requests";
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to create request");
    } finally {
      setRequestSubmitting(false);
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

    if (shuffleEnabled) {
      const history = shuffleHistoryRef.current;
      const previousSongId = history.pop();
      if (previousSongId) {
        setCurrentSongId(previousSongId);
        setIsPlaying(true);
      }
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

    if (shuffleEnabled) {
      const candidates = songs.filter((song) => song.id !== currentSong.id);
      const pool = candidates.length > 0 ? candidates : songs;
      const nextSong = pool[Math.floor(Math.random() * pool.length)];

      if (!nextSong) {
        return;
      }

      shuffleHistoryRef.current.push(currentSong.id);
      if (shuffleHistoryRef.current.length > 100) {
        shuffleHistoryRef.current.shift();
      }

      setCurrentSongId(nextSong.id);
      setIsPlaying(true);
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
          <button
            type="button"
            className={`reload-icon-button ${reloadPending ? "loading" : ""}`}
            onClick={() => void reloadLibrary()}
            disabled={reloadPending}
            aria-label="Reload library"
            title="Reload library"
          >
            <ReloadIcon />
          </button>

          <input
            type="search"
            placeholder="Search by title, artist, or album"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search songs"
          />

          <button type="button" className="request-button" onClick={() => setRequestModalOpen(true)}>
            Request
          </button>
        </div>
        {reloadPending ? <p className="top-status">Reloading library...</p> : null}
        {!reloadPending && reloadMessage ? <p className="top-status">{reloadMessage}</p> : null}
      </header>

      {requestModalOpen ? (
        <div className="modal-overlay" onClick={() => setRequestModalOpen(false)}>
          <div className="request-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Request Albums</h2>
            <p>Please enter the album(s) you want to request.</p>

            <input
              type="search"
              placeholder="Search albums"
              value={requestQuery}
              onChange={(event) => setRequestQuery(event.target.value)}
            />

            <div className="request-selected">Selected: {selectedRequests.length}/3</div>

            {requestLoading ? <p className="info-text">Searching...</p> : null}
            {requestError ? <p className="status error">{requestError}</p> : null}

            <div className="request-results">
              {requestResults.map((album) => {
                const selected = selectedRequests.some((item) => item.id === album.id);
                return (
                  <button
                    type="button"
                    key={album.id}
                    className={`request-result ${selected ? "selected" : ""}`}
                    onClick={() => toggleRequestedAlbum(album)}
                    disabled={!selected && selectedRequests.length >= 3}
                  >
                    {album.coverUrl && !brokenRequestCovers.has(album.id) ? (
                      <img
                        src={album.coverUrl}
                        alt={album.title}
                        className="request-result-cover"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          setBrokenRequestCovers((prev) => {
                            const next = new Set(prev);
                            next.add(album.id);
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <div className="request-result-cover-fallback" aria-hidden="true">
                        No Art
                      </div>
                    )}

                    <div className="request-result-meta">
                      <strong>{album.title}</strong>
                      <span>{album.artist}</span>
                    </div>

                    <small>{album.year || ""}</small>
                  </button>
                );
              })}
            </div>

            <div className="request-pagination">
              <button
                type="button"
                onClick={() => setRequestPage((page) => Math.max(0, page - 1))}
                disabled={requestLoading || requestPage === 0}
              >
                Previous
              </button>
              <span>Page {requestPage + 1}</span>
              <button
                type="button"
                onClick={() => setRequestPage((page) => page + 1)}
                disabled={requestLoading || !requestHasMore}
              >
                Next
              </button>
            </div>

            <div className="request-modal-actions">
              <button type="button" onClick={() => setRequestModalOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => void submitRequests()} disabled={requestSubmitting}>
                {requestSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="song-list" aria-live="polite">
        {loading
          ? Array.from({ length: loadingSkeletonCount }).map((_, index) => (
              <div
                key={`song-skeleton-${index}`}
                className="song-item song-item-skeleton"
                aria-hidden="true"
              >
                <div className="song-art skeleton-block" />
                <div className="song-meta">
                  <div className="skeleton-line skeleton-line-title" />
                  <div className="skeleton-line skeleton-line-artist" />
                  <div className="skeleton-line skeleton-line-album" />
                </div>
              </div>
            ))
          : null}

        {!loading && loadError ? <p className="status error">{loadError}</p> : null}

        {!loading && !loadError && filteredSongs.length === 0 ? <p className="info-text">No songs found.</p> : null}

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
                      Cover
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
              Cover
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
            className={`transport-button ${shuffleEnabled ? "active" : ""}`}
            onClick={() => {
              setShuffleEnabled((enabled) => {
                const next = !enabled;
                if (!next) {
                  shuffleHistoryRef.current = [];
                }
                return next;
              });
            }}
            disabled={!currentSong}
            aria-label={shuffleEnabled ? "Disable shuffle" : "Enable shuffle"}
            title={shuffleEnabled ? "Shuffle on" : "Shuffle off"}
          >
            <ShuffleIcon />
          </button>
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
