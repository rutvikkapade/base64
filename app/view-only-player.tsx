"use client";

import { useEffect, useRef, useState } from "react";

type ViewOnlyPlayerProps = {
  src: string;
  checkoutBusy: boolean;
  onError: () => void;
  onDownload: () => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = String(whole % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function previewSize(videoWidth: number, videoHeight: number): {
  width: number;
  height: number;
} {
  const width = Math.max(160, Math.min(480, Math.round(videoWidth * 0.25)));
  const height = Math.max(1, Math.round((videoHeight / videoWidth) * width));
  return { width, height };
}

function blockSave(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export default function ViewOnlyPlayer({
  src,
  checkoutBusy,
  onError,
  onDownload,
}: ViewOnlyPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const onErrorRef = useRef(onError);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const paint = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const size = previewSize(video.videoWidth, video.videoHeight);
        if (canvas.width !== size.width || canvas.height !== size.height) {
          canvas.width = size.width;
          canvas.height = size.height;
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "low";
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(paint);
    };

    const onMeta = () => setDuration(video.duration || 0);
    const onTime = () => setCurrent(video.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const handleError = () => onErrorRef.current();

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", handleError);

    rafRef.current = requestAnimationFrame(paint);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", handleError);
    };
  }, [src]);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      await video.play();
    } else {
      video.pause();
    }
  }

  return (
    <div
      className="player-stage"
      onContextMenu={blockSave}
      onDragStart={blockSave}
    >
      <video
        ref={videoRef}
        className="player-source"
        src={src}
        playsInline
        preload="auto"
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
        tabIndex={-1}
        onContextMenu={blockSave}
      />
      <canvas
        ref={canvasRef}
        className="player-frame"
        onContextMenu={blockSave}
        onDoubleClick={togglePlay}
      />
      <p className="player-preview-label">Preview</p>
      <div className="player-bar">
        <button type="button" className="btn ghost player-toggle" onClick={togglePlay}>
          {playing ? "Pause" : "Play"}
        </button>
        <input
          className="player-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          aria-label="Position"
          onChange={(event) => {
            const next = Number(event.target.value);
            const video = videoRef.current;
            if (video) {
              video.currentTime = next;
            }
            setCurrent(next);
          }}
        />
        <span className="player-time">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <button
          type="button"
          className="btn primary player-download"
          onClick={onDownload}
          disabled={checkoutBusy}
        >
          {checkoutBusy ? "Redirecting…" : "Download at higher quality"}
        </button>
      </div>
    </div>
  );
}
