"use client";

import Link from "next/link";
import { Camera } from "lucide-react";

interface BrandProps {
  href?: string;
  onClick?: () => void;
}

export function Brand({ href = "/", onClick }: BrandProps) {
  const content = <><span className="brand-mark"><Camera size={21} strokeWidth={1.8} aria-hidden="true" /></span><span>pho<span className="brand-number">2</span>booth<span className="brand-dot">.</span></span></>;
  return onClick ? (
    <button className="brand" onClick={onClick} aria-label="Pho2Booth home">{content}</button>
  ) : (
    <Link className="brand" href={href} aria-label="Pho2Booth home">{content}</Link>
  );
}
