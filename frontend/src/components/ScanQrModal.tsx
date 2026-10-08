"use client";

import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { getNetworkIp } from '@/lib/api';
import styles from './Studios.module.css';
import { Dialog } from './Dialog';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  shareCode?: string;
  onGenerateCode?: () => Promise<{ shareCode: string; stripId?: string }>;
  title?: string;
};

export function ScanQrModal({ isOpen, onClose, shareCode, onGenerateCode, title = 'Take your photos with you' }: Props) {
  const [savedCode, setSavedCode] = useState<string>();
  const [qr, setQr] = useState<{ url: string; image: string }>();
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [mode, setMode] = useState<'lan' | 'origin' | 'custom'>('lan');
  const [customHost, setCustomHost] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const generateRef = useRef(onGenerateCode);
  const requestRef = useRef(0);
  useEffect(() => { generateRef.current = onGenerateCode; }, [onGenerateCode]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void getNetworkIp().then(ip => { if (!cancelled) setLanIp(ip); }).catch(() => {});
    return () => {
      cancelled = true; requestRef.current += 1;

    };
  }, [isOpen]);

  const code = shareCode || savedCode;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  let host = origin;
  if (local && mode === 'lan' && lanIp) host = `${window.location.protocol}//${lanIp}${window.location.port ? `:${window.location.port}` : ''}`;
  if (mode === 'custom' && customHost.trim()) {
    try {
      const url = new URL(/^https?:\/\//.test(customHost.trim()) ? customHost.trim() : `https://${customHost.trim()}`);
      if (['http:', 'https:'].includes(url.protocol)) host = url.origin;
    } catch { host = ''; }
  }
  const url = code && host ? `${host}/download/${encodeURIComponent(code)}` : '';

  useEffect(() => {
    if (!isOpen || !url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 360, margin: 2, color: { dark: '#29251f', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(image => {
      if (!cancelled) setQr({ url, image });
    }).catch(() => { if (!cancelled) setError('Could not create a QR image. You can still open or copy the saved link.'); });
    return () => { cancelled = true; };
  }, [isOpen, url]);

  const generate = async () => {
    if (!generateRef.current || pending) return;
    const request = ++requestRef.current;
    setPending(true); setError('');
    try {
      const result = await generateRef.current();
      if (request === requestRef.current) setSavedCode(result.shareCode);
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : 'Sharing is unavailable. Please retry.');
    } finally { setPending(false); }
  };

  if (!isOpen) return null;
  return <Dialog title={title} onClose={onClose}><div className={styles.studio}>
      <p className={styles.eyebrow}>Keep a little joy</p>
      <p id="share-dialog-description" className="status-note my-3">Save online to make a real download link. Local PNG downloads remain available from the editor when sharing is offline.</p>
      {!code && <button className="button button-primary w-full" disabled={pending || !onGenerateCode} onClick={() => void generate()}><RefreshCw size={18} />{pending ? 'Saving your photo…' : error ? 'Retry sharing' : 'Create download link'}</button>}
      {error && <p role="alert" className="status-note my-3">{error}</p>}
      {code && <>
        <div className="bg-white border border-[#ddd6c8] rounded-xl p-4 my-5 text-center">
          {qr?.url === url ? <img src={qr.image} width={280} height={280} alt="Scan to open your saved photo download" className="mx-auto max-w-full" /> : <p role="status">{url ? 'Preparing QR…' : 'Enter a valid host address.'}</p>}
          <p className="mt-2">Share code: <strong className="share-code-value">{code}</strong></p>
        </div>
        <div className="flex gap-2"><button className="button button-secondary flex-1" disabled={!url} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('Could not copy. Open the link and copy its address.'); } }}><Copy size={18} />{copied ? 'Copied' : 'Copy link'}</button><a className="button button-secondary" href={url || undefined} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />Open</a></div>
        <p className="status-note my-4">On your phone, open Camera, scan this code, then tap the link to download.</p>
        {local && <div className="border-t border-[#ddd6c8] pt-4"><label className="control-label" htmlFor="share-network">Connection</label><select id="share-network" className="control-input w-full" value={mode} onChange={event => { setCopied(false); setMode(event.target.value as typeof mode); }}><option value="lan">Same Wi-Fi network (for phones &amp; other devices)</option><option value="origin">This computer only (localhost)</option><option value="custom">Custom address or LAN IP</option></select>
          {mode === 'custom' && <label className="control-label">Host address<input className="control-input w-full" value={customHost} placeholder="https://your-booth.example" onChange={event => { setCopied(false); setCustomHost(event.target.value); }} /></label>}
          <p className="status-note mt-2">{mode === 'lan' && lanIp ? `Uses ${lanIp}. Your phone must share this computer’s Wi-Fi network and be able to reach the server.` : mode === 'custom' ? 'Use an address reachable from your phone.' : 'A localhost link only works on this computer. Use a reachable Wi-Fi or custom address for a phone.'}</p>
        </div>}
      </>}
    </div></Dialog>;
}
