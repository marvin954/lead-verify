import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mammba Verify",
  description: "Lead verification platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-surface-base">
      <body className="bg-surface-base text-ink-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
