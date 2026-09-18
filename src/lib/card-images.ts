"use client";

// ─── Card image access — Contract 7 (lib/contracts.ts) ──────────
// The ONLY module that touches db.cardImages. Editor and review UIs call
// these helpers; they never open the table directly. Blobs live in
// IndexedDB (db v13) with the object-URL pattern proven by wallpapers:
// create per render need, revoke on cleanup, never leak.

import { db, uid, deleteMatching, type CardImageRec } from "@/lib/db";

export const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB, same as wallpapers
export const CARD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;

export function isSupportedImage(file: { type: string; size: number }): boolean {
  return (CARD_IMAGE_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_CARD_IMAGE_BYTES;
}

/** Fetch the image record for one side of a card, or null. */
export async function getCardImage(cardId: string, side: "front" | "back"): Promise<CardImageRec | null> {
  return (
    (await db.cardImages.where("[cardId+side]").equals([cardId, side]).first()) ?? null
  );
}

/** Save (or replace) the image for one side of a card. */
export async function setCardImage(
  cardId: string,
  side: "front" | "back",
  blob: Blob,
  name: string
): Promise<CardImageRec> {
  if (!isSupportedImage(blob)) throw new Error("UNSUPPORTED_IMAGE");
  await deleteMatching("cardImages", db.cardImages.where("[cardId+side]").equals([cardId, side]));
  const rec: CardImageRec = {
    id: uid(),
    cardId,
    side,
    blob,
    type: blob.type || "image/png",
    name,
    regions: null,
    createdAt: new Date(),
  };
  await db.cardImages.add(rec);
  return rec;
}

/** Remove the image from one side. No-op when there is none. */
export async function removeCardImage(cardId: string, side: "front" | "back"): Promise<void> {
  await deleteMatching("cardImages", db.cardImages.where("[cardId+side]").equals([cardId, side]));
}

/** Delete every image owned by a card (card deletion cleanup). */
export async function deleteCardImages(cardId: string): Promise<void> {
  await deleteMatching("cardImages", db.cardImages.where("cardId").equals(cardId));
}

/** Snapshot every image of a card BEFORE deletion, for faithful undo. */
export async function snapshotCardImages(cardId: string): Promise<CardImageRec[]> {
  return db.cardImages.where("cardId").equals(cardId).toArray();
}

/** Re-insert a snapshot taken by snapshotCardImages (undo path). */
export async function restoreCardImages(recs: CardImageRec[]): Promise<void> {
  if (recs.length) await db.cardImages.bulkPut(recs);
}

// ─── Object-URL hook (the wallpapers pattern) ────────────────────
// Components call useCardImageUrl(rec) and render the string; the URL is
// created once per record identity and revoked on change/unmount.
import { useEffect, useState } from "react";

export function useCardImageUrl(rec: CardImageRec | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rec) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object-URL lifecycle must live in the effect; the null reset is part of it
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec?.id, rec]); // record identity drives the URL lifecycle
  return url;
}

/** Both side-images for one card id, loaded live (null id → none). */
export function useCardSideImages(
  cardId: string | null | undefined
): { front: CardImageRec | null; back: CardImageRec | null } {
  const [imgs, setImgs] = useState<{ front: CardImageRec | null; back: CardImageRec | null }>({
    front: null,
    back: null,
  });
  useEffect(() => {
    if (!cardId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async IndexedDB load keyed by card id; the reset is its guard clause
      setImgs({ front: null, back: null });
      return;
    }
    let stale = false;
    (async () => {
      const [front, back] = await Promise.all([getCardImage(cardId, "front"), getCardImage(cardId, "back")]);
      if (!stale) setImgs({ front, back });
    })();
    return () => {
      stale = true;
    };
  }, [cardId]);
  return imgs;
}
