import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAPS — Sales Cycle Management",
  description:
    "Lead Generation, Appointments, Proposals, Sales — Edler Zain sales cycle management.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
