"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AlbumRequest } from "@/lib/types";

type RequestsPayload = {
  requests?: AlbumRequest[];
  error?: string;
};

export default function RequestsAdminPage() {
  const [requests, setRequests] = useState<AlbumRequest[]>([]);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function loadRequests() {
    setLoading(true);
    try {
      const response = await fetch("/api/requests", { cache: "no-store" });
      const payload = (await response.json()) as RequestsPayload;

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load requests");
      }

      setRequests(payload.requests || []);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  const pending = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);

  async function complete(id: string) {
    try {
      const response = await fetch("/api/requests/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, password })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to complete request");
      }

      setStatus("Request completed.");
      await loadRequests();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to complete request");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main className="requests-page">
      <div className="requests-wrap">
        <header className="requests-header">
          <h1>Requests Admin</h1>
          <a href="/requests">View Public Requests</a>
        </header>

        <form className="admin-password" onSubmit={onSubmit}>
          <label>
            Admin Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>
        </form>

        {status ? <p className="status">{status}</p> : null}
        {loading ? <p className="info-text">Loading requests...</p> : null}

        <section className="requests-section">
          <h2>Pending Requests</h2>
          {pending.length === 0 ? <p className="info-text">No pending requests.</p> : null}
          {pending.map((request) => (
            <article className="request-card" key={request.id}>
              <div>
                <strong>{request.title}</strong>
                <span>{request.artist}</span>
                <small>{request.year || ""}</small>
              </div>
              <button type="button" onClick={() => void complete(request.id)} disabled={!password}>
                Complete
              </button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
