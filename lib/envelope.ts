import {
  ENVELOPE_PREFIX,
  ENVELOPE_VERSION,
  IV_LENGTH,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
} from "./crypto-params";
import { bytesToBase64, decodeBase64ToBytes } from "./decode-base64";

export { ENVELOPE_PREFIX };

export type DecryptedVideo = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
};

export function isEnvelope(input: string): boolean {
  return input.trim().startsWith(ENVELOPE_PREFIX);
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

async function deriveAesKey(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

export async function encryptVideo(
  bytes: Uint8Array,
  secret: string,
  mime: string,
): Promise<string> {
  if (!secret) {
    throw new Error("PLAYBACK_SECRET is empty.");
  }

  const mimeBytes = new TextEncoder().encode(mime);
  if (mimeBytes.length === 0 || mimeBytes.length > 255) {
    throw new Error("MIME type is missing or too long.");
  }

  const salt = crypto.getRandomValues(
    new Uint8Array(new ArrayBuffer(SALT_LENGTH)),
  );
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_LENGTH)));
  const key = await deriveAesKey(secret, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      copyBytes(bytes),
    ),
  );

  const packed = new Uint8Array(
    1 + salt.length + iv.length + 1 + mimeBytes.length + ciphertext.length,
  );
  let offset = 0;
  packed[offset] = ENVELOPE_VERSION;
  offset += 1;
  packed.set(salt, offset);
  offset += salt.length;
  packed.set(iv, offset);
  offset += iv.length;
  packed[offset] = mimeBytes.length;
  offset += 1;
  packed.set(mimeBytes, offset);
  offset += mimeBytes.length;
  packed.set(ciphertext, offset);

  return ENVELOPE_PREFIX + bytesToBase64(packed);
}

export async function decryptEnvelope(
  paste: string,
  secret: string,
): Promise<DecryptedVideo> {
  if (!secret) {
    throw new Error("Playback secret is not configured.");
  }

  const trimmed = paste.trim();
  if (!isEnvelope(trimmed)) {
    throw new Error("Not an encrypted payload (expected b64v1. prefix).");
  }

  const packed = decodeBase64ToBytes(trimmed.slice(ENVELOPE_PREFIX.length));
  const headerSize = 1 + SALT_LENGTH + IV_LENGTH + 1;

  if (packed.byteLength < headerSize + 1) {
    throw new Error("Encrypted payload is truncated or corrupt.");
  }

  let offset = 0;
  const version = packed[offset];
  offset += 1;
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${version}.`);
  }

  const salt = copyBytes(packed.subarray(offset, offset + SALT_LENGTH));
  offset += SALT_LENGTH;
  const iv = copyBytes(packed.subarray(offset, offset + IV_LENGTH));
  offset += IV_LENGTH;
  const mimeLength = packed[offset];
  offset += 1;

  if (!mimeLength || offset + mimeLength >= packed.byteLength) {
    throw new Error("Encrypted payload is truncated or corrupt.");
  }

  const mime = new TextDecoder().decode(
    packed.subarray(offset, offset + mimeLength),
  );
  offset += mimeLength;
  const ciphertext = copyBytes(packed.subarray(offset));

  try {
    const key = await deriveAesKey(secret, salt, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return {
      bytes: new Uint8Array(plain),
      mime,
    };
  } catch {
    throw new Error("Could not decrypt. Wrong secret or corrupted payload.");
  }
}

export function sniffMime(bytes: Uint8Array, filename = ""): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".ogg") || lower.endsWith(".ogv")) return "video/ogg";
  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".m4v") ||
    lower.endsWith(".mov")
  ) {
    return "video/mp4";
  }

  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "video/mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return "video/ogg";
  }

  return "video/mp4";
}
