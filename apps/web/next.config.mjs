/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["mapbox-gl", "@fieldtrack/types"],
  images: {
    domains: [],
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://fieldtrack.meowsician.tech";
    // Only proxy locally - in production the real API URL is used directly
    if (apiUrl.includes("localhost")) {
      return [
        {
          source: "/fieldtrack-api/:path*",
          destination: "https://fieldtrack.meowsician.tech/:path*",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
