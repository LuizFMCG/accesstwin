import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://accesstwin-lfg.luizfelipegiacobbo.chatgpt.site",
  ),
  title: "AccessTwin — atlas de afinidades urbanas",
  description:
    "Escolha um território e encontre, em todo o índice, as áreas com a composição cotidiana mais parecida usando Jensen–Shannon.",
  applicationName: "AccessTwin",
  category: "urbanismo",
  openGraph: {
    title: "AccessTwin — um lugar pode ter um irmão longe daqui",
    description:
      "Atlas de afinidades urbanas baseado em composição funcional e Jensen–Shannon.",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "AccessTwin — um lugar pode ter um irmão longe daqui.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessTwin — atlas de afinidades urbanas",
    description:
      "Encontre os territórios com a composição cotidiana mais parecida.",
    images: ["/og.png"],
  },
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
