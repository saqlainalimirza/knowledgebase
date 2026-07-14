/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg must not be bundled into the server build (Next 14.2 syntax).
  experimental: {
    serverComponentsExternalPackages: ["pg"],
    instrumentationHook: true, // boots the daily-sync scheduler (lib/cron.ts)
  },
};
export default nextConfig;
