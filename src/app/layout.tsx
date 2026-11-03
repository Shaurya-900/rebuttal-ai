import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Rebuttal", description: "A PayPal dispute agent that cannot be talked out of the rules." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
