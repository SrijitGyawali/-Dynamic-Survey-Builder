import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The admin login moved from /login to /admin; keep old links working.
  async redirects() {
    return [{ source: "/login", destination: "/admin", permanent: true }];
  },
};

export default nextConfig;
