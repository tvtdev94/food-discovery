import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Fredoka } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Body font — tối ưu dấu tiếng Việt; swap để tránh FOIT.
const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["vietnamese", "latin"],
  variable: "--font-body",
  display: "swap",
});

// Display font cho hero/wordmark — rounded & friendly.
// Fredoka không hỗ trợ subset vietnamese; dùng latin-ext làm fallback cho dấu.
const fredoka = Fredoka({
  weight: ["500", "600", "700"],
  subsets: ["latin-ext", "latin"],
  variable: "--font-display",
  display: "swap",
});

// Resolve site URL: explicit env (production) → Vercel preview → localhost dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ăn gì hôm nay",
    template: "%s · Ăn gì hôm nay",
  },
  description:
    "Hỏi 'hôm nay ăn gì?' — food-buddy gợi ý quán gần bạn theo mood, thời tiết và vị trí. Miễn phí, không đăng ký.",
  applicationName: "ĂnGì",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    // SVG cũng dùng được làm apple-touch-icon trên iOS 16+. Trước đó tham
    // chiếu /icon-192.png mà file không tồn tại → 404.
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "ĂnGì",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#EA580C",
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${fredoka.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground font-sans" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
