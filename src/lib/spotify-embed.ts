// Pure Spotify link helpers for the embed player.
// No auth, no API key, no Premium — the official Spotify iframe embed
// renders any public playlist / track / album from a share link or URI.

export type EmbedKind = "playlist" | "track" | "album" | "episode" | "show" | "artist";

const KINDS: EmbedKind[] = ["playlist", "track", "album", "episode", "show", "artist"];

// Turn a Spotify URI (spotify:playlist:ID), a share link
// (https://open.spotify.com/playlist/ID?si=...), or an existing embed URL
// into the canonical https://open.spotify.com/embed/... URL. Returns null
// when the input can't be parsed as a Spotify resource.
export function toSpotifyEmbedUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // spotify:playlist:ID  /  spotify:track:ID  etc.
  const uri = raw.match(/^spotify:(playlist|track|album|episode|show|artist):([A-Za-z0-9]+)/);
  if (uri) return `https://open.spotify.com/embed/${uri[1]}/${uri[2]}`;

  try {
    const url = new URL(raw);
    if (url.hostname.replace(/^www\./, "") === "open.spotify.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const [kind, id] = parts;
      if (KINDS.includes(kind as EmbedKind) && id) {
        return `https://open.spotify.com/embed/${kind}/${id}`;
      }
      // already an embed url — pass through
      if (kind === "embed" && parts[1] && parts[2]) return raw;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

// Convert an embed URL back into a normal open.spotify.com link (for the
// "Open in Spotify" button).
export function toSpotifyWebUrl(embedUrl: string): string {
  return embedUrl.replace("/embed/", "/");
}
