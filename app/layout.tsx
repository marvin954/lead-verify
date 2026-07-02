import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mammba Verify",
  description: "Lead verification platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
