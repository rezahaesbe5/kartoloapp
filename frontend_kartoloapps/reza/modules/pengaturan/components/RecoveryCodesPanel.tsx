import { useState } from 'react';
import { Check, Copy, Download, KeyRound, ShieldAlert } from 'lucide-react';

interface RecoveryCodesPanelProps {
  codes: string[];
  generatedAt?: string;
}

/**
 * Tampilan daftar recovery codes + tombol salin & unduh.
 * Dipakai di MfaEnableModal (post-confirm) dan MfaRegenerateModal (post-regen).
 * Codes plaintext HANYA tampil sekali — komponen ini tidak menyimpan apa-apa
 * di luar lifecycle parent. Setelah parent tutup, codes hilang dari memori.
 */
export function RecoveryCodesPanel({ codes, generatedAt }: RecoveryCodesPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop — user bisa select & copy manual
    }
  };

  const download = () => {
    const stamp = generatedAt
      ? new Date(generatedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const content = [
      'Kartolo SuperApps — Recovery Codes MFA',
      `Dibuat: ${generatedAt ? new Date(generatedAt).toLocaleString('id-ID') : new Date().toLocaleString('id-ID')}`,
      '',
      'Tiap kode hanya bisa dipakai SEKALI. Simpan di tempat aman',
      '(password manager / brankas / kertas). JANGAN bagikan ke siapa pun.',
      '',
      ...codes,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kartolo-recovery-codes-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200">
          <p className="font-semibold">Simpan kode ini sekarang.</p>
          <p className="mt-0.5 text-xs leading-snug">
            Kode hanya tampil sekali. Pakai kalau Anda kehilangan authenticator
            untuk login & reset MFA.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm tracking-wider text-slate-900 dark:text-slate-100">
          {codes.map((c, i) => (
            <div key={c} className="flex items-center gap-2 select-all">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 w-5 text-right">
                {String(i + 1).padStart(2, '0')}.
              </span>
              <span className="break-all">{c}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-600 hover:bg-primary-50 dark:hover:bg-slate-600 transition-colors duration-200"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              Tersalin
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Salin semua
            </>
          )}
        </button>
        <button
          type="button"
          onClick={download}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-600 hover:bg-primary-50 dark:hover:bg-slate-600 transition-colors duration-200"
        >
          <Download className="h-4 w-4" />
          Unduh .txt
        </button>
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
        <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Format kode: <code className="font-mono">XXXX-XXXX-XXXX</code> (12 karakter,
        sekali pakai).
      </p>
    </div>
  );
}
