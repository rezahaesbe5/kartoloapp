// Parser user-agent ringan (tanpa dep eksternal). Cukup untuk display
// "Chrome di Windows" / "Safari di iPhone". Bukan akurasi 100%, bukan untuk
// fingerprinting.

export interface ParsedUA {
  browser: string;
  os: string;
  label: string; // gabungan untuk display ringkas
}

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua) return { browser: 'Tidak diketahui', os: '-', label: 'Tidak diketahui' };

  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  return { browser, os, label: `${browser} · ${os}` };
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/MSIE |Trident\//i.test(ua)) return 'Internet Explorer';
  return 'Browser lain';
}

function detectOs(ua: string): string {
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua) && !/Mobile/i.test(ua)) return 'macOS';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'OS lain';
}
