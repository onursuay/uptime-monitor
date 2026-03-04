import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uptime Monitor",
  description: "Site izleme ve durum takip paneli",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-dark-900 antialiased">{children}</body>
    </html>
  );
}
