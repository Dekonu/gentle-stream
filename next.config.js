/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the Google Fonts domain for font loading
  images: {
    domains: [],
  },
  async rewrites() {
    return [
      // Typo safety: URL uses hyphens; callers might use underscore
      {
        source: "/api/game/killer_sudoku",
        destination: "/api/game/killer-sudoku",
      },
    ];
  },
};

module.exports = nextConfig;
