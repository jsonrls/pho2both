"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/Brand";
import { AccountDropdown } from "@/components/AccountDropdown";
import { useAuth } from "@/lib/authContext";

interface SiteHeaderProps { onStartBooth?: () => void; compact?: boolean }

export function SiteHeader({ onStartBooth, compact = false }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { status } = useAuth();
  const pathname = usePathname();
  const accountLabel = status === "authenticated" ? "Your account" : status === "guest" ? "Sign in" : "Account";
  const libraryHref = status === "guest" ? "/auth?redirect=%2Flibrary" : "/library";
  const accountHref = pathname === "/library" && status === "guest" ? "/auth?redirect=%2Flibrary" : "/auth";
  const startContent = "Start booth";
  return <header className="site-header">
    <div className="site-header-inner page-container">
      <Brand />
      <nav className="site-nav" aria-label="Main navigation">
        {!compact && <Link href="/#mini-studio">Studio preview</Link>}
        <Link href={libraryHref} aria-current={pathname === "/library" ? "page" : undefined}>My library</Link>
        <Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined}>Pricing</Link>
        <Link href="/download" aria-current={pathname === "/download" ? "page" : undefined}>Find by code</Link>
      </nav>
      <div className="site-header-actions">
        {onStartBooth ? <button className="button button-primary" onClick={onStartBooth}>{startContent}</button> : <Link className="button button-primary" href="/?booth=1">{startContent}</Link>}
        <AccountDropdown />
        <button className="icon-button menu-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
    {menuOpen && <nav className="mobile-navigation" id="mobile-navigation" aria-label="Mobile navigation" onClick={() => setMenuOpen(false)}>
      <Link href={libraryHref} aria-current={pathname === "/library" ? "page" : undefined}>My library</Link><Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined}>Pricing</Link><Link href="/download" aria-current={pathname === "/download" ? "page" : undefined}>Find by code</Link><Link href={accountHref} aria-current={pathname === "/auth" ? "page" : undefined}>{accountLabel}</Link>
      {onStartBooth ? <button className="button button-primary" onClick={onStartBooth}>{startContent}</button> : <Link href="/?booth=1">Start booth</Link>}
    </nav>}
  </header>;
}
