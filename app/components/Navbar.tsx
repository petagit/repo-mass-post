"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

import Image from "next/image";

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
            <Link href="/" className="flex items-center space-x-2 group">
              <div className="relative w-10 h-10 overflow-hidden rounded-xl border border-white/20 shadow-2xl transition-transform group-hover:scale-110">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              <span className="text-xl font-bold text-theme-primary transition-all drop-shadow-lg group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                XHS Poster
              </span>
            </Link>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center space-x-1">
            <ThemeToggle />
            {navItems.map((item) => {
              const isActive = !item.external && pathname === item.href;

              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium text-theme-primary/90 hover:text-theme-primary hover:bg-white/20 rounded-md transition-all"
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href as any}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${isActive
                      ? "bg-white/30 text-theme-primary shadow-lg"
                      : "text-theme-primary/90 hover:text-theme-primary hover:bg-white/20"
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


