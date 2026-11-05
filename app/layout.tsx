import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";
import { AppShell } from "@/components/app-shell";
import "./editorial.css";
import { INTERFACE_BOOT_SCRIPT } from "@/lib/interface-style";

export const metadata: Metadata = {
  title: "TREND RADAR — Cultural Intelligence",
  description: "From trends to cultural insights.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-ui: classic(기존 Y2K Pixel Desktop) | editorial(Editorial Web). 첫 화면 전에 아래 스크립트가 저장된 선택으로 바꾼다.
    <html lang="ko" data-ui="classic" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: INTERFACE_BOOT_SCRIPT }}/></head>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
