import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProLife — AI Distributor Agent",
  description: "AI-powered distributor search and outreach for ProLife Swiss Medical Technology",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-dark text-white antialiased">
        {children}
      </body>
    </html>
  );
}
