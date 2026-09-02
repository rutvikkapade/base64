"use client";

import { useEffect, useRef, useState } from "react";
import { decodeBase64ToBytes, parseBase64Input } from "@/lib/decode-base64";
import { decryptEnvelope, isEnvelope } from "@/lib/envelope";
import ViewOnlyPlayer from "./view-only-player";

const CODE_STORAGE_KEY = "watch_code";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("PAYPAL") || message.includes("PayPal") || message.includes("checkout")) {
    return "Payments aren't available right now. Try again later.";
  }
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

function extensionFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogv";
  return "mp4";
}

export default function Converter() {
  const [input, setInput] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [paid, setPaid] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef("video/mp4");
  const restoredRef = useRef(false);

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
    blobRef.current = blob;
    mimeRef.current = type;
    const url = URL.createObjectURL(blob);
    replaceObjectUrl(url);
    setStatus({ kind: "ok", text: "Ready." });
  }

  async function loadVideo(code: string) {
    if (!code.trim()) {
      setStatus({ kind: "error", text: "Paste the code first." });
      return;
    }

    setStatus({ kind: "busy", text: "Loading…" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      if (isEnvelope(code)) {
        const response = await fetch("/api/playback", { cache: "no-store" });
        const body = (await response.json()) as {
          secret?: string;
          error?: string;
        };
        if (!response.ok || !body.secret) {
          throw new Error(body.error || "Could not load the playback secret from the server.");
        }
        const { bytes, mime } = await decryptEnvelope(code, body.secret);
        playBytes(bytes, mime);
        sessionStorage.setItem(CODE_STORAGE_KEY, code);
        return;
      }

      const { mimeType, payload } = parseBase64Input(code);
      const bytes = decodeBase64ToBytes(payload);
      playBytes(bytes, mimeType || "video/mp4");
      sessionStorage.setItem(CODE_STORAGE_KEY, code);
    } catch (error) {
      blobRef.current = null;
      replaceObjectUrl(null);
      setStatus({ kind: "error", text: friendlyError(error) });
    }
  }

  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    restoredRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const paidReturn = params.get("paid") === "1";
    const canceled = params.get("canceled") === "1";
    const saved = sessionStorage.getItem(CODE_STORAGE_KEY);

    void (async () => {
      try {
        const response = await fetch("/api/paypal/status", { cache: "no-store" });
        const body = (await response.json()) as { paid?: boolean };
        const isPaid = Boolean(body.paid);
        setPaid(isPaid);

        if (saved) {
          setInput(saved);
          await loadVideo(saved);
          if (blobRef.current && (isPaid || paidReturn)) {
            setStatus({ kind: "ok", text: "Payment received. You can download now." });
          } else if (canceled && blobRef.current) {
            setStatus({ kind: "error", text: "Payment canceled. You can still watch." });
          }
        } else if (isPaid || paidReturn) {
          setStatus({ kind: "ok", text: "Payment received. Paste the code, then download." });
        }
      } catch {
        setPaid(false);
      }

      if (params.has("paid") || params.has("canceled")) {
        window.history.replaceState({}, "", "/");
      }
    })();
  }, []);

  async function handleConvert() {
    await loadVideo(input);
  }

  function handleClear() {
    setInput("");
    blobRef.current = null;
    replaceObjectUrl(null);
    setStatus({ kind: "idle" });
    sessionStorage.removeItem(CODE_STORAGE_KEY);
  }

  function downloadBlob() {
    const blob = blobRef.current;
    if (!blob) {
      setStatus({ kind: "error", text: "Load the video first, then download." });
      return;
    }
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `video.${extensionFor(mimeRef.current)}`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  async function handleDownload() {
    if (paid) {
      downloadBlob();
      return;
    }

    if (!input.trim() && !sessionStorage.getItem(CODE_STORAGE_KEY)) {
      setStatus({ kind: "error", text: "Paste the code first." });
      return;
    }

    sessionStorage.setItem(CODE_STORAGE_KEY, input.trim() || sessionStorage.getItem(CODE_STORAGE_KEY) || "");
    setCheckoutBusy(true);
    setStatus({ kind: "busy", text: "Opening PayPal…" });

    try {
      const response = await fetch("/api/paypal/create-order", { method: "POST" });
      const body = (await response.json()) as {
        approveUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.approveUrl) {
        throw new Error(body.error || "Could not start PayPal checkout.");
      }
      window.location.assign(body.approveUrl);
    } catch (error) {
      setCheckoutBusy(false);
      setStatus({ kind: "error", text: friendlyError(error) });
    }
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
            checkoutBusy={checkoutBusy}
            onDownload={handleDownload}
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
