import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/notifications/RegisterServiceWorker";

export const metadata: Metadata = {
  title: { default: "Seen!", template: "%s · Seen!" },
  description: "Find the picture before your friends do. A turn-based picture-hunt game.",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Seen!", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
