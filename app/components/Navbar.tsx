"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

export default function Navbar(): JSX.Element {
  const pathname = usePathname();

  // Hide navbar on /post page
  if (pathname === "/post") {
    return <></>;
  }

  const navItems: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/post", label: "Post" },
    { href: "/extract-images", label: "Extract Images" },
    { href: "https://transition-video.vercel.app/", label: "Transition Video", external: true },
  ];

  return (
    <nav className="glass-strong border-b border-white/20 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-xl font-semibold text-white hover:text-white/90 transition-colors drop-shadow-lg">
              XHS Poster
            </Link>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = !item.external && pathname === item.href;
              
              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium text-white/90 hover:text-white hover:bg-white/20 rounded-md transition-all backdrop-blur-sm"
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href as any}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all backdrop-blur-sm ${
                    isActive
                      ? "bg-white/30 text-white shadow-lg"
                      : "text-white/90 hover:text-white hover:bg-white/20"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}


