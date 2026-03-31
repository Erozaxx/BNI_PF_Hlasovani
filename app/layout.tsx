import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BNI Plzen - Hlasovani",
  description: "Hlasovaci aplikace pro BNI Plzen chapter",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className={`${poppins.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
