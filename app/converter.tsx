"use client";

import { useEffect, useRef, useState } from "react";
import { decodeBase64ToBytes, parseBase64Input } from "@/lib/decode-base64";
import { decryptEnvelope, isEnvelope } from "@/lib/envelope";

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
  const encryptedPaste = isEnvelope(input);

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

  function playBytes(bytes: Uint8Array<ArrayBuffer>, type: string, note: string) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    replaceObjectUrl(url);
    const sizeKb = (bytes.byteLength / 1024).toFixed(1);
    setStatus({ kind: "ok", text: `${note} ${sizeKb} KB as ${type}.` });
  }

  async function handleConvert() {
    if (!input.trim()) {
      setStatus({
        kind: "error",
        text: "Paste encrypted payload (or raw base64) first.",
      });
      return;
    }

    setStatus({
      kind: "busy",
      text: encryptedPaste ? "Decrypting…" : "Decoding…",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      if (isEnvelope(input)) {
        const response = await fetch("/api/playback", { cache: "no-store" });
        const body = (await response.json()) as {
          secret?: string;
          error?: string;
        };
        if (!response.ok || !body.secret) {
          throw new Error(
            body.error || "Could not load the playback secret from the server.",
          );
        }
        const { bytes, mime } = await decryptEnvelope(input, body.secret);
        playBytes(bytes, mime, "Decrypted");
        return;
      }

      const { mimeType, payload } = parseBase64Input(input);
      const bytes = decodeBase64ToBytes(payload);
      const type = mimeType || selectedMime;
      playBytes(
        bytes,
        type,
        mimeType ? "Decoded (from data URL)" : "Decoded",
      );
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
        <p className="eyebrow">Decrypt locally in the browser</p>
        <h1>Encrypted video player</h1>
        <p className="lede">
          Paste a <code>b64v1.</code> payload. The key stays in the cloud (Vercel
          env); you only paste the encrypted code.
        </p>
      </header>

      <section className="panel" aria-label="Encrypted payload">
        <label className="field-label" htmlFor="base64-input">
          Encrypted code
        </label>
        <textarea
          id="base64-input"
          className="paste"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="b64v1.AAAA…  (or raw / data URL base64)"
          spellCheck={false}
          autoComplete="off"
        />

        <div className="toolbar">
          {!encryptedPaste ? (
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
              <em>Used only for unencrypted pastes.</em>
            </label>
          ) : (
            <p className="mime-hint">Encrypted payload detected. Format is inside the file.</p>
          )}

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
              {status.kind === "busy"
                ? encryptedPaste
                  ? "Decrypting…"
                  : "Decoding…"
                : "Decrypt & play"}
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
                text: "Decrypted successfully, but this browser could not play those bytes.",
              })
            }
          />
        ) : (
          <div className="player-empty">
            Decrypted video will appear here.
          </div>
        )}
      </section>
    </div>
  );
}
