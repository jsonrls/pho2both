"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkBackendHealth } from "@/lib/api";
import { BackendHealth } from "@/types/booth";
import { Database, Server, RefreshCw } from "lucide-react";

export function BackendStatus() {
  const [health, setHealth] = useState<BackendHealth>({
    status: "checking",
    neonConfigured: false,
  });
  const [loading, setLoading] = useState(false);

  const mounted = useRef(false);
  const refreshHealth = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true);
    const res = await checkBackendHealth();
    if (!mounted.current) return;
    setHealth(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const initialRefresh = setTimeout(refreshHealth, 0);
    const interval = setInterval(refreshHealth, 15000);
    return () => {
      mounted.current = false;
      clearTimeout(initialRefresh);
      clearInterval(interval);
    };
  }, [refreshHealth]);

  return (
    <div className="flex items-center gap-2 bg-white border border-[#dfe7f2] rounded-full px-3 py-1 text-xs text-[#354158] shadow-[0_1px_3px_rgba(20,33,58,0.04)]">
      <div className="flex items-center gap-1.5">
        <Server className="w-3.5 h-3.5 text-[#536079]" />
        <span className="font-medium text-[#14213a]">API:</span>
        {health.status === "checking" ? (
          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Connecting
          </span>
        ) : health.status === "online" ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Offline
          </span>
        )}
      </div>

      <div className="h-3 w-px bg-[#dfe7f2] mx-1" />

      <div className="flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5 text-[#175ce5]" />
        <span className="font-medium text-[#14213a]">Neon:</span>
        {health.neonConfigured ? (
          <span className="text-[#175ce5] font-bold">
            {health.neonStatus === "connected" ? "Connected" : "Ready"}
          </span>
        ) : (
          <span className="text-amber-700 text-[11px] bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            Memory Fallback
          </span>
        )}
      </div>

      <button
        onClick={refreshHealth}
        disabled={loading}
        title="Refresh backend status"
        className="text-neutral-400 hover:text-neutral-800 transition ml-1 disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
