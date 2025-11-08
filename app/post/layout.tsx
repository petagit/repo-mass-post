import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "../components/ThemeProvider";
import ThemeToggle from "../components/ThemeToggle";

export const metadata: Metadata = {
  title: "Post for me Tool",
  description: "Post content to social media platforms",
};

export default function PostLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <ThemeProvider>
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Toaster position="top-right" />
      {children}
    </ThemeProvider>
  );
}

