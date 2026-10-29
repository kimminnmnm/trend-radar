import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "TREND RADAR — Cultural Intelligence",
  description: "From trends to cultural insights.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
