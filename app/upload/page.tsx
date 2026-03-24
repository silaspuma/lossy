"use client";

import { FormEvent, useState } from "react";

type UploadState = {
  loading: boolean;
  message: string;
  error: boolean;
};

const initialState: UploadState = {
  loading: false,
  message: "",
  error: false
};

export default function UploadPage() {
  const [state, setState] = useState<UploadState>(initialState);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setState({ loading: true, message: "Uploading...", error: false });

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Upload failed");
      }

      setState({ loading: false, message: payload.message || "Upload complete", error: false });
      form.reset();
    } catch (error) {
      setState({
        loading: false,
        message: error instanceof Error ? error.message : "Upload failed",
        error: true
      });
    }
  };

  return (
    <main className="upload-page">
      <form className="upload-form" onSubmit={handleSubmit}>
        <h1>Upload Song</h1>

        <label>
          Audio File (.mp3 or .m4a)
          <input name="audio" type="file" accept="audio/mpeg,audio/mp4,.mp3,.m4a" required />
        </label>

        <label>
          Artwork (Optional JPG/PNG)
          <input name="artwork" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" />
        </label>

        <label>
          Title (Optional override)
          <input name="title" type="text" />
        </label>

        <label>
          Artist (Optional override)
          <input name="artist" type="text" />
        </label>

        <label>
          Album (Optional override)
          <input name="album" type="text" />
        </label>

        <button type="submit" disabled={state.loading}>
          {state.loading ? "Uploading..." : "Upload"}
        </button>

        {state.message ? (
          <p className={state.error ? "status error" : "status success"}>{state.message}</p>
        ) : null}
      </form>
    </main>
  );
}
