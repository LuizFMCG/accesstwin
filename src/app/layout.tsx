import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccessTwin — encontre os gêmeos urbanos de um território",
  description:
    "Escolha um território e descubra automaticamente as áreas com o cotidiano mais parecido usando isócronas e similaridade Jensen–Shannon.",
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
