"use client";

import { useEffect, useMemo, useState } from "react";
import type { AlbumRequest } from "@/lib/types";

type RequestsPayload = {
  requests?: AlbumRequest[];
  error?: string;
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<AlbumRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/requests", { cache: "no-store" });
        const payload = (await response.json()) as RequestsPayload;

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load requests");
        }

        setRequests(payload.requests || []);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load requests");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const pending = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  const completed = useMemo(() => requests.filter((request) => request.status === "completed"), [requests]);

  return (
    <main className="requests-page">
      <div className="requests-wrap">
        <header className="requests-header">
          <h1>Album Requests</h1>
          <a href="/">Back to Player</a>
        </header>

        {loading ? <p className="info-text">Loading requests...</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        <section className="requests-section">
          <h2>Current Requests</h2>
          {pending.length === 0 ? <p className="info-text">No current requests.</p> : null}
          {pending.map((request) => (
            <article className="request-card" key={request.id}>
              <strong>{request.title}</strong>
              <span>{request.artist}</span>
              <small>{request.year || ""}</small>
            </article>
          ))}
        </section>

        <section className="requests-section">
          <h2>Completed Requests</h2>
          {completed.length === 0 ? <p className="info-text">No completed requests.</p> : null}
          {completed.map((request) => (
            <article className="request-card completed" key={request.id}>
              <strong>{request.title}</strong>
              <span>{request.artist}</span>
              <small>{request.year || ""}</small>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
