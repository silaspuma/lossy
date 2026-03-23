import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lossy",
  description: "Private self-hosted music streaming app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
