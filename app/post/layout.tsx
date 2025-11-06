import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";

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
    <>
      <Toaster position="top-right" />
      {children}
    </>
  );
}

