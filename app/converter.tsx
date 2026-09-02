"use client";

import { useEffect, useRef, useState } from "react";
import { decodeBase64ToBytes, parseBase64Input } from "@/lib/decode-base64";
import { decryptEnvelope, isEnvelope } from "@/lib/envelope";
import ViewOnlyPlayer from "./view-only-player";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("PLAYBACK_SECRET") || message.includes("playback secret")) {
    return "Video isn't available right now. Try again later.";
  }
  if (
    message.includes("decrypt") ||
    message.includes("envelope") ||
    message.includes("base64") ||
    message.includes("truncated") ||
    message.includes("corrupt")
  ) {
    return "This code didn't work. Check you copied all of it.";
  }

  return "Something went wrong. Try pasting the code again.";
}

export default function Converter() {
  const [input, setInput] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const objectUrlRef = useRef<string | null>(null);

  function replaceObjectUrl(next: string | null) {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = next;
    setVideoUrl(next);
  }

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function playBytes(bytes: Uint8Array<ArrayBuffer>, type: string) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    replaceObjectUrl(url);
    setStatus({ kind: "ok", text: "Ready." });
  }

  async function handleConvert() {
    if (!input.trim()) {
      setStatus({ kind: "error", text: "Paste the code first." });
      return;
    }

    setStatus({ kind: "busy", text: "Loading…" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      if (isEnvelope(input)) {
        const response = await fetch("/api/playback", { cache: "no-store" });
        const body = (await response.json()) as {
          secret?: string;
          error?: string;
        };
        if (!response.ok || !body.secret) {
          throw new Error(body.error || "Could not load the playback secret from the server.");
        }
        const { bytes, mime } = await decryptEnvelope(input, body.secret);
        playBytes(bytes, mime);
        return;
      }

      const { mimeType, payload } = parseBase64Input(input);
      const bytes = decodeBase64ToBytes(payload);
      playBytes(bytes, mimeType || "video/mp4");
    } catch (error) {
      replaceObjectUrl(null);
      setStatus({ kind: "error", text: friendlyError(error) });
    }
  }

  function handleClear() {
    setInput("");
    replaceObjectUrl(null);
    setStatus({ kind: "idle" });
  }

  return (
    <div className="shell">
      <header className="hero">
        <h1>Watch video</h1>
        <p className="lede">Paste the code you were given, then press Play.</p>
      </header>

      <section className="panel" aria-label="Code">
        <label className="field-label" htmlFor="base64-input">
          Code
        </label>
        <textarea
          id="base64-input"
          className="paste"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste here"
          spellCheck={false}
          autoComplete="off"
        />

        <div className="toolbar">
          <div className="actions">
            <button
              type="button"
              className="btn ghost"
              onClick={handleClear}
              disabled={status.kind === "busy"}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleConvert}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy" ? "Loading…" : "Play"}
            </button>
          </div>
        </div>

        {status.kind !== "idle" ? (
          <p className={`status status-${status.kind}`} role="status">
            {status.text}
          </p>
        ) : null}
      </section>

      <section className="panel player-panel" aria-label="Video">
        {videoUrl ? (
          <ViewOnlyPlayer
            key={videoUrl}
            src={videoUrl}
            onError={() =>
              setStatus({
                kind: "error",
                text: "This video couldn't be played in your browser.",
              })
            }
          />
        ) : (
          <div className="player-empty">Video will appear here.</div>
        )}
      </section>
    </div>
  );
}
