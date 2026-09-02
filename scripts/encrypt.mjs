import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

const ENVELOPE_PREFIX = "b64v1.";
const ENVELOPE_VERSION = 1;
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const args = { in: "", out: "", mime: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--in" && value) {
      args.in = value;
      i += 1;
    } else if (flag === "--out" && value) {
      args.out = value;
      i += 1;
    } else if (flag === "--mime" && value) {
      args.mime = value;
      i += 1;
    }
  }
  return args;
}

function sniffMime(bytes, filename = "") {
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

function looksLikeBase64File(filename) {
  const ext = extname(filename).toLowerCase();
  return ext === ".b64" || ext === ".txt" || ext === ".base64";
}

function bytesFromInput(filePath) {
  const raw = readFileSync(filePath);
  if (!looksLikeBase64File(filePath)) {
    return raw;
  }

  let text = raw.toString("utf8").trim();
  const marker = ";base64,";
  const lower = text.toLowerCase();
  if (lower.startsWith("data:") && lower.includes(marker)) {
    text = text.slice(lower.indexOf(marker) + marker.length);
  }

  const payload = text.replace(/\s+/g, "");
  return Buffer.from(payload, "base64");
}

export function encryptBytes(plain, secret, mime) {
  if (!secret) {
    throw new Error("PLAYBACK_SECRET is empty.");
  }

  const mimeBuf = Buffer.from(mime, "utf8");
  if (mimeBuf.length === 0 || mimeBuf.length > 255) {
    throw new Error("MIME type is missing or too long.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const packed = Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    salt,
    iv,
    Buffer.from([mimeBuf.length]),
    mimeBuf,
    encrypted,
    cipher.getAuthTag(),
  ]);

  return ENVELOPE_PREFIX + packed.toString("base64");
}

function printUsage() {
  console.error(`Encrypt a video on this machine. The client only pastes the output.

Usage:
  npm run encrypt -- --in clip.mp4 --out payload.txt
  npm run encrypt -- --in clip.b64 --out payload.txt

Reads PLAYBACK_SECRET from .env.local (or the environment).`);
}

function main() {
  loadEnvLocal();

  const args = parseArgs(process.argv.slice(2));
  if (!args.in) {
    printUsage();
    process.exit(1);
  }

  const inputPath = resolve(process.cwd(), args.in);
  if (!existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const secret = process.env.PLAYBACK_SECRET?.trim();
  if (!secret) {
    console.error(
      "Set PLAYBACK_SECRET in .env.local (copy .env.example) before encrypting.",
    );
    process.exit(1);
  }

  const plain = bytesFromInput(inputPath);
  if (plain.length === 0) {
    console.error("Input file is empty.");
    process.exit(1);
  }

  const mime = args.mime || sniffMime(plain, basename(inputPath));
  const payload = encryptBytes(plain, secret, mime);

  if (args.out) {
    const outPath = resolve(process.cwd(), args.out);
    writeFileSync(outPath, payload, "utf8");
    console.log(`Wrote ${payload.length} characters to ${outPath}`);
    console.log(`MIME: ${mime}`);
  } else {
    process.stdout.write(payload);
  }
}

const invokedAsCli =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  main();
}
