/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Apply Referrer-Policy: no-referrer to all /m/* routes
        // to prevent the token in the URL from leaking via Referer headers.
        source: "/m/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        // Same mitigation for the interview fill-form magic link (iter-020,
        // T-008, arch section 5 / R-3) — token lives in the URL path here too.
        source: "/i/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
