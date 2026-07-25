import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccessTwin — compare o que uma cidade coloca ao seu alcance",
  description:
    "Compare a composição de lugares alcançáveis a partir de dois pontos usando isócronas e similaridade Jensen–Shannon.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
