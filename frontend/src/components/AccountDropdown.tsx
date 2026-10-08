"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, House, Images, LogOut, QrCode, User, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import styles from "./AccountDropdown.module.css";

interface AccountDropdownProps {
  onBackHome?: () => void;
  className?: string;
}

export function AccountDropdown({ onBackHome, className = "" }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { user, status, logout } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const isAuthenticated = status === "authenticated" && Boolean(user);
  const avatarLetter = (user?.name || user?.email || "♡").trim().slice(0, 1).toUpperCase() || "♡";
  const libraryHref = status === "guest" ? "/auth?redirect=%2Flibrary" : "/library";
  const signInHref = pathname === "/library" ? "/auth?redirect=%2Flibrary" : "/auth";

  const planLabel = user?.plan === "creator_yearly"
    ? "⭐ Creator (Yearly)"
    : user?.plan === "creator_monthly"
      ? "⭐ Creator (Monthly)"
      : user?.plan === "event"
        ? "⭐ Event Pass"
        : isAuthenticated
          ? "Free Member"
          : "Guest (Free)";

  if (!isAuthenticated) {
    return (
      <Link
        href={signInHref}
        className={`button button-secondary ${styles.signInLink} ${className}`.trim()}
      >
        Sign in
      </Link>
    );
  }

  const handleBackHome = () => {
    setIsOpen(false);
    if (onBackHome) {
      onBackHome();
    }
  };

  const handleSignOut = () => {
    setIsOpen(false);
    void logout();
  };

  return (
    <div ref={containerRef} className={`${styles.container} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="User account menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={styles.avatar}>
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name || "Avatar"} className={styles.avatarImg} />
          ) : (
            avatarLetter
          )}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          aria-hidden="true"
          className={`${styles.chevron} ${isOpen ? styles.chevronRotated : ""}`}
        />
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="menu" aria-label="Account options">
          <div className={styles.headerCard}>
            <div className={styles.headerAvatar} aria-hidden="true">
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className={styles.avatarImg} />
              ) : (
                avatarLetter
              )}
            </div>
            <div className={styles.headerInfo}>
              <div className={styles.userName}>
                {user?.name || "Member"}
              </div>
              <div className={styles.userEmail}>
                {user?.email || ""}
              </div>
              <span className={styles.badge}>
                {planLabel}
              </span>
            </div>
          </div>

          <div className={styles.menuList}>
            {onBackHome ? (
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={handleBackHome}
              >
                <House size={16} aria-hidden="true" />
                <span>Back to Home</span>
              </button>
            ) : (
              <Link
                href="/"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                <House size={16} aria-hidden="true" />
                <span>Back to Home</span>
              </Link>
            )}

            <Link
              href={libraryHref}
              className={styles.menuItem}
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <Images size={16} aria-hidden="true" />
              <span>My library</span>
            </Link>

            <Link
              href="/download"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <QrCode size={16} aria-hidden="true" />
              <span>Find by code</span>
            </Link>

            <Link
              href="/pricing"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>Pricing & Plans</span>
            </Link>

            {!isAuthenticated ? (
              <Link
                href="/pricing"
                className={styles.menuItem}
                style={{ color: "var(--light-red, #ea6c58)", fontWeight: 700 }}
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                <User size={16} aria-hidden="true" />
                <span>Upgrade to Creator</span>
              </Link>
            ) : (
              <Link
                href="/auth"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                <User size={16} aria-hidden="true" />
                <span>Account settings</span>
              </Link>
            )}

            {isAuthenticated && (
              <>
                <div className={styles.divider} role="separator" />
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.signOutItem}`}
                  role="menuitem"
                  onClick={handleSignOut}
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
