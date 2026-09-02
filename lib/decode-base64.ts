const DATA_URL_MARKER = ";base64,";
const DECODE_CHUNK_SIZE = 32768; // must stay a multiple of 4

export type ParsedBase64 = {
  mimeType: string | null;
  payload: string;
};

export function parseBase64Input(input: string): ParsedBase64 {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith("data:") && lower.includes(DATA_URL_MARKER)) {
    const idx = lower.indexOf(DATA_URL_MARKER);
    const header = trimmed.slice("data:".length, idx);
    const mimeType = header.split(";")[0]?.trim() || null;
    const payload = trimmed.slice(idx + DATA_URL_MARKER.length);
    return { mimeType, payload };
  }

  return { mimeType: null, payload: trimmed };
}

export function decodeBase64ToBytes(rawPayload: string): Uint8Array<ArrayBuffer> {
  const payload = rawPayload.replace(/\s+/g, "");

  if (!payload) {
    throw new Error("No base64 data found.");
  }

  if (payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw new Error("Invalid base64. Check for missing characters or extra text.");
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array(
    new ArrayBuffer((payload.length / 4) * 3 - padding),
  );
  let offset = 0;

  for (let i = 0; i < payload.length; i += DECODE_CHUNK_SIZE) {
    const binary = atob(payload.slice(i, i + DECODE_CHUNK_SIZE));
    for (let j = 0; j < binary.length; j += 1) {
      bytes[offset] = binary.charCodeAt(j);
      offset += 1;
    }
  }

  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}
