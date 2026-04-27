import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  // Sentry + OpenTelemetry dùng require-in-the-middle với dynamic require →
  // webpack báo "Critical dependency" liên tục. Externalize chúng để Next bỏ
  // qua bundle-time analysis (Sentry chỉ cần ở runtime server). Pattern này
  // chính thức trong Sentry docs cho Next 15.
  serverExternalPackages: [
    "@sentry/nextjs",
    "@sentry/node",
    "@sentry/opentelemetry",
    "@opentelemetry/instrumentation",
    "@opentelemetry/instrumentation-http",
    "@prisma/instrumentation",
    "require-in-the-middle",
  ],
  // Belt-and-suspenders: kể cả khi externalize, một số instrumentation chunk
  // vẫn lọt vào graph. Filter warning theo message để dev log sạch.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.ignoreWarnings = [
        ...(config.ignoreWarnings ?? []),
        { module: /node_modules\/@opentelemetry\/instrumentation/ },
        { module: /node_modules\/require-in-the-middle/ },
        { module: /node_modules\/@prisma\/instrumentation/ },
      ];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
