import { describe, expect, it } from "vitest";
import {
  decodeShare,
  decodeShareAsync,
  decodeShareEncrypted,
  encodeShare,
  encodeShareCompressed,
  encodeShareEncrypted,
  isEncryptedPayload,
  parseSharedBundle,
  type SharedBundle,
} from "@/lib/share";

const BUNDLE: SharedBundle = {
  name: "Biology 101",
  description: "Mitosis deck",
  cards: [
    { front: "Powerhouse?", back: "Mitochondria" },
    { front: "Mitosis has {{4}} stages", back: "Mitosis has 4 stages", kind: "cloze" },
    { front: "Largest organ?", back: "Skin", kind: "choice", choices: ["Liver", "Skin", "Heart"] },
  ],
};

describe("share codec", () => {
  it("round-trips a bundle through encode/decode", () => {
    const hash = encodeShare(BUNDLE);
    const back = decodeShare<SharedBundle>(hash);
    expect(back.name).toBe("Biology 101");
    expect(back.cards).toHaveLength(3);
    expect(back.cards[2].choices).toEqual(["Liver", "Skin", "Heart"]);
  });

  it("round-trips a compressed bundle via decodeShareAsync", async () => {
    const hash = await encodeShareCompressed(BUNDLE);
    expect(hash.startsWith("gz:")).toBe(true);
    const back = await decodeShareAsync<SharedBundle>(hash);
    expect(back.name).toBe("Biology 101");
    expect(back.cards).toHaveLength(3);
  });

  it("round-trips an encrypted bundle with AES-GCM", async () => {
    const hash = await encodeShareEncrypted(BUNDLE, "secret123");
    expect(isEncryptedPayload(hash)).toBe(true);
    const back = await decodeShareEncrypted<SharedBundle>(hash, "secret123");
    expect(back.name).toBe("Biology 101");

    await expect(decodeShareEncrypted<SharedBundle>(hash, "wrongpass")).rejects.toThrow();
  });

  it("produces URL-safe output", () => {
    expect(encodeShare(BUNDLE)).not.toMatch(/[+/=]/);
  });

  it("rejects garbage payloads", () => {
    expect(() => parseSharedBundle({ nope: true })).toThrow();
    expect(() => parseSharedBundle({ name: "x", cards: [] })).toThrow();
  });
});