import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Navbar from "./components/Navbar";

export const metadata: Metadata = {
  title: "XHS → Post-Bridge Poster",
  description: "Extract media from Xiaohongshu and post via Post-Bridge",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-900">
        <Navbar />
        <Toaster position="top-right" />
        {children}
      </body>
    </html>
  );
}



