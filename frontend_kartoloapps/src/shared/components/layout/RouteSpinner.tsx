import { Loader2 } from 'lucide-react';

export function RouteSpinner({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-muted">
      <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}
