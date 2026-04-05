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
    ];
  },
};

export default nextConfig;
