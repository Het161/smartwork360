'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n/provider';
import { AuthProvider } from './auth';
import { GuideProvider } from '@/components/guide/GuideProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // No WebSockets by design — dashboards poll every 30s instead.
            refetchInterval: 30_000,
            refetchOnWindowFocus: false,
            staleTime: 15_000,
            retry: (failureCount, error) => {
              // Never retry auth/permission failures; they will not fix themselves.
              const status = (error as { status?: number })?.status;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <AuthProvider>
          {/* Saarthi sits inside auth + i18n: tours are role-scoped and bilingual. */}
          <GuideProvider>{children}</GuideProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
