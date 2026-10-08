"use client";

import React from "react";
import { AuthProvider } from "@/lib/authContext";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
