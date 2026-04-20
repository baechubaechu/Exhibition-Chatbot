import type { NextConfig } from "next";

/**
 * 기본 `npm run dev`는 Turbopack — webpack dev 런타임 청크 오류 회피.
 * `npm run dev:webpack`은 표준 webpack dev.
 * dev 전역 `Cache-Control: no-store`는 `/_next/static` 청크까지 걸려 새로고침 시 모듈 로드가 깨질 수 있어 사용하지 않음.
 */
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "256kb",
    },
  },
  turbopack: {},
};

export default nextConfig;
