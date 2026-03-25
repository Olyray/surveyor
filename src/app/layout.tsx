import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Surveyor",
  description: "Generate realistic test responses for Google Forms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
