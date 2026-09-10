import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Library merge: Subjects + Flashcards + Bundles → /subjects
      // Keep deep deck page /bundles/[id]/cards reachable — do NOT catch it.
      { source: "/flashcards", destination: "/subjects", permanent: false },
      { source: "/flashcards/:path*", destination: "/subjects", permanent: false },
      { source: "/bundles", destination: "/subjects", permanent: false },
      // single segment only (e.g. /bundles/abc) → Library; /bundles/abc/cards stays mounted
      { source: "/bundles/:id", destination: "/subjects", permanent: false },
    ];
  },
};

export default nextConfig;
