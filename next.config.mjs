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
      {
        // Public BNI PDFs behind the info pages (iter-029, arch_iter-029_T-001
        // section 7.5). PDFs cannot carry a robots meta tag, so noindex goes
        // into a response header.
        source: "/pravidla/zdroje/:file*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
