"use client";

import { useEffect, useRef, useState } from "react";
import { decodeBase64ToBytes, parseBase64Input } from "@/lib/decode-base64";

const MIME_OPTIONS = [
  { value: "video/mp4", label: "MP4 (video/mp4)" },
  { value: "video/webm", label: "WebM (video/webm)" },
  { value: "video/ogg", label: "Ogg (video/ogg)" },
] as const;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

export default function Converter() {
  const [input, setInput] = useState("");
  const [selectedMime, setSelectedMime] = useState<string>("video/mp4");
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

  async function handleConvert() {
    if (!input.trim()) {
      setStatus({ kind: "error", text: "Paste base64 (or a data URL) first." });
      return;
    }

    setStatus({ kind: "busy", text: "Decoding…" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const { mimeType, payload } = parseBase64Input(input);
      const bytes = decodeBase64ToBytes(payload);
      const type = mimeType || selectedMime;
      const blob = new Blob([bytes], { type });
      const url = URL.createObjectURL(blob);
      replaceObjectUrl(url);

      const sizeKb = (bytes.byteLength / 1024).toFixed(1);
      setStatus({
        kind: "ok",
        text: mimeType
          ? `Decoded ${sizeKb} KB as ${type} (from data URL).`
          : `Decoded ${sizeKb} KB as ${type}.`,
      });
    } catch (error) {
      replaceObjectUrl(null);
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not decode the pasted data.",
      });
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
        <p className="eyebrow">Client-side only</p>
        <h1>Base64 to video</h1>
        <p className="lede">
          Paste raw base64 or a <code>data:video/…;base64,</code> URL. Nothing is
          uploaded — decoding happens in your browser.
        </p>
      </header>

      <section className="panel" aria-label="Base64 input">
        <label className="field-label" htmlFor="base64-input">
          Base64
        </label>
        <textarea
          id="base64-input"
          className="paste"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAA… or data:video/mp4;base64,…"
          spellCheck={false}
          autoComplete="off"
        />

        <div className="toolbar">
          <label className="mime">
            <span>Format</span>
            <select
              value={selectedMime}
              onChange={(event) => setSelectedMime(event.target.value)}
            >
              {MIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <em>Used when the paste has no data-URL type.</em>
          </label>

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
              {status.kind === "busy" ? "Decoding…" : "Convert & play"}
            </button>
          </div>
        </div>

        {status.kind !== "idle" ? (
          <p className={`status status-${status.kind}`} role="status">
            {status.text}
          </p>
        ) : null}
      </section>

      <section className="panel player-panel" aria-label="Video player">
        <h2>Player</h2>
        {videoUrl ? (
          <video
            key={videoUrl}
            className="player"
            src={videoUrl}
            controls
            playsInline
            onError={() =>
              setStatus({
                kind: "error",
                text: "Decoded successfully, but this browser could not play those bytes. Try another format.",
              })
            }
          />
        ) : (
          <div className="player-empty">
            Converted video will appear here.
          </div>
        )}
      </section>
    </div>
  );
}
