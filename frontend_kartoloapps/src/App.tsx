import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { modules } from './registry';
import { ProtectedRoute } from './shared/components/layout/ProtectedRoute';
import { PublicOnlyRoute } from './shared/components/layout/PublicOnlyRoute';
import { AuthBoot } from './shared/components/AuthBoot';
import { useThemeStore } from './shared/stores/theme-store';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
    mutations: { retry: 0 },
  },
});

function wrap(element: ReactNode, access: 'protected' | 'public-only' | 'public' = 'protected'): ReactNode {
  if (access === 'protected') return <ProtectedRoute>{element}</ProtectedRoute>;
  if (access === 'public-only') return <PublicOnlyRoute>{element}</PublicOnlyRoute>;
  return element;
}

export function App() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBoot />
        <Routes>
          {modules.flatMap((m) =>
            m.routes.map((r) => (
              <Route
                key={`${m.name}-${r.path}`}
                path={r.path}
                element={wrap(r.element, r.access ?? 'protected')}
              />
            )),
          )}
          <Route path="/" element={<Navigate to="/portal" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
