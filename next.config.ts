import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Library merge: Subjects + Flashcards + Bundles → one Library page at /subjects
      // Keep deep deck page /bundles/[id]/cards; only the list routes redirect.
      { source: "/flashcards", destination: "/subjects", permanent: false },
      { source: "/flashcards/:path*", destination: "/subjects", permanent: false },
      { source: "/bundles", destination: "/subjects", permanent: false },
    ];
  },
};

export default nextConfig;
