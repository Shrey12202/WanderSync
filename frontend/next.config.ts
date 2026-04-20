/** @type {import('next').NextConfig} */

// The backend URL — set NEXT_PUBLIC_API_URL in Vercel for production.
// Falls back to localhost for local development.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Parse hostname + port from the URL for Next.js image domains
let apiHostname = "localhost";
let apiPort = "8000";
let apiProtocol: "http" | "https" = "http";

try {
  const parsed = new URL(apiUrl);
  apiHostname = parsed.hostname;
  apiPort = parsed.port;
  apiProtocol = parsed.protocol.replace(":", "") as "http" | "https";
} catch {
  // Fallback if URL is malformed
}

const nextConfig = {
  // Allow loading images from the backend API (local + production)
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/api/uploads/**",
      },
      // Production backend (e.g., Render)
      ...(apiHostname !== "localhost"
        ? [
            {
              protocol: apiProtocol,
              hostname: apiHostname,
              ...(apiPort ? { port: apiPort } : {}),
              pathname: "/api/uploads/**",
            },
          ]
        : []),
    ],
  },

  // In production on Vercel the frontend calls the backend directly via
  // NEXT_PUBLIC_API_URL, so no server-side proxy is needed.
  // During local development we proxy /api/* → localhost:8000 for convenience.
  async rewrites() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
