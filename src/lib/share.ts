import { z } from "zod";

// ─── Share codec ─────────────────────────────────────────────
// One shared-bundle format for both transports:
//   • LINK: JSON → base64url in the /share#hash (offline, no server)
//   • FILE: same JSON as a .studymax-bundle.json download
// Kind/choices ride along so cloze + multiple-choice cards survive sharing.

export const sharedCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  kind: z.enum(["basic", "cloze", "choice"]).optional(),
  choices: z.array(z.string()).optional(),
});

export const sharedBundleSchema = z.object({
  app: z.literal("studymax-share").optional(),
  version: z.number().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  cards: z.array(sharedCardSchema).min(1).max(5000),
});

export type SharedBundle = z.infer<typeof sharedBundleSchema>;

export const SHARE_URL_LIMIT = 1800;

export function encodeShare(bundle: SharedBundle): string {
  const json = JSON.stringify({ app: "studymax-share", version: 1, ...bundle });
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeShare<T>(hash: string): T {
  let clean = hash.startsWith("#") ? hash.slice(1) : hash;
  clean = clean.trim();
  clean = clean.replaceAll("\n", "").replaceAll("\r", "").replaceAll(" ", "");
  let padded = clean.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4;
  if (pad === 1) throw new Error("Invalid share payload");
  if (pad === 2) padded += "==";
  else if (pad === 3) padded += "=";
  const json = decodeURIComponent(escape(atob(padded)));
  return JSON.parse(json) as T;
}

export function parseSharedBundle(raw: unknown): SharedBundle {
  return sharedBundleSchema.parse(raw);
}
