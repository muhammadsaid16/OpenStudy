import { z } from "zod";

// ─── Share codec ─────────────────────────────────────────────
// One shared-bundle format for both transports:
//   • LINK: JSON → base64url in the /share#hash (offline, no server)
//   • FILE: same JSON as a .studymax-bundle.json download
// Kind/choices ride along so cloze + multiple-choice cards survive sharing.

export const sharedCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  kind: z.enum(["basic", "cloze", "choice"]).nullable().optional(),
  choices: z.array(z.string()).nullable().optional(),
});

export const sharedBundleSchema = z.object({
  app: z.literal("studymax-share").nullable().optional(),
  version: z.number().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  cards: z.array(sharedCardSchema).min(1).max(5000),
});

export type SharedBundle = z.infer<typeof sharedBundleSchema>;

export const SHARE_URL_LIMIT = 1800;

// GZIP Compression / Decompression helpers
export async function compressPayload(text: string): Promise<string> {
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([new TextEncoder().encode(text)])
        .stream()
        .pipeThrough(new CompressionStream("gzip"));
      const buffer = await new Response(stream).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return "gz:" + btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    } catch {
      // Fallback if stream piping fails
    }
  }
  return btoa(unescape(encodeURIComponent(text)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function decompressPayload(hash: string): Promise<string> {
  let clean = hash.startsWith("#") ? hash.slice(1) : hash;
  clean = clean.trim().replaceAll("\n", "").replaceAll("\r", "").replaceAll(" ", "");

  if (clean.startsWith("gz:")) {
    const rawB64 = clean.slice(3).replaceAll("-", "+").replaceAll("_", "/");
    let padded = rawB64;
    const pad = rawB64.length % 4;
    if (pad === 2) padded += "==";
    else if (pad === 3) padded += "=";

    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  let padded = clean.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4;
  if (pad === 1) throw new Error("Invalid share payload");
  if (pad === 2) padded += "==";
  else if (pad === 3) padded += "=";
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeShare(bundle: SharedBundle): string {
  const json = JSON.stringify({ app: "studymax-share", version: 1, ...bundle });
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function encodeShareCompressed(bundle: SharedBundle): Promise<string> {
  const json = JSON.stringify({ app: "studymax-share", version: 1, ...bundle });
  return compressPayload(json);
}

export function decodeShare<T>(hash: string): T {
  let clean = hash.startsWith("#") ? hash.slice(1) : hash;
  clean = clean.trim();
  clean = clean.replaceAll("\n", "").replaceAll("\r", "").replaceAll(" ", "");
  if (clean.startsWith("gz:")) {
    throw new Error("Use decodeShareAsync for compressed payload");
  }
  let padded = clean.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4;
  if (pad === 1) throw new Error("Invalid share payload");
  if (pad === 2) padded += "==";
  else if (pad === 3) padded += "=";
  const json = decodeURIComponent(escape(atob(padded)));
  return JSON.parse(json) as T;
}

export async function decodeShareAsync<T>(hash: string): Promise<T> {
  const json = await decompressPayload(hash);
  return JSON.parse(json) as T;
}

export function parseSharedBundle(raw: unknown): SharedBundle {
  // Normalize: sender may have exported description: null / tags: null (Dexie stores null)
  // which strict .optional() rejects. Coerce null → undefined before zod.
  const norm = raw as Record<string, unknown>;
  if (norm && typeof norm === "object") {
    if (norm.description === null) norm.description = undefined;
    if (Array.isArray((norm as { cards?: unknown[] }).cards)) {
      for (const c of (norm as { cards: Record<string, unknown>[] }).cards) {
        if (c.description === null) c.description = undefined;
        if (c.tags === null) c.tags = undefined;
        if (c.kind === null) c.kind = undefined;
        if (c.choices === null) c.choices = undefined;
      }
    }
  }
  return sharedBundleSchema.parse(norm);
}

// ─── AES-GCM Encryption Extensions ─────────────────────────────
export function isEncryptedPayload(hash: string): boolean {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  return clean.startsWith("enc:");
}

export async function encodeShareEncrypted(bundle: SharedBundle, passcode: string): Promise<string> {
  const json = JSON.stringify({ app: "studymax-share", version: 1, ...bundle });
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(json));

  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, "0")).join("");
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

  return `enc:${saltHex}:${ivHex}:${cipherB64}`;
}

export async function decodeShareEncrypted<T>(hash: string, passcode: string): Promise<T> {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const parts = clean.split(":");
  if (parts.length !== 4 || parts[0] !== "enc") throw new Error("Invalid encrypted payload format");

  const salt = new Uint8Array(parts[1].match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const iv = new Uint8Array(parts[2].match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

  let cipherB64 = parts[3].replaceAll("-", "+").replaceAll("_", "/");
  const pad = cipherB64.length % 4;
  if (pad === 2) cipherB64 += "==";
  else if (pad === 3) cipherB64 += "=";
  const ciphertext = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as T;
}


