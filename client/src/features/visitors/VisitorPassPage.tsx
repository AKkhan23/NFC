import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface Verify {
  kind: string;
  name: string;
  valid: boolean;
  status: string;
  validFrom: string;
  validTo: string;
  usedCount: number;
  maxUses: number;
}

export function VisitorPassPage(): JSX.Element {
  const { token } = useParams();
  const query = useQuery({
    queryKey: ['visitor-verify', token],
    queryFn: async () => (await axios.get(`/api/v/${token}`)).data.data as Verify,
    enabled: !!token && /^[0-9a-f]{64}$/.test(token ?? ''),
    retry: false,
  });

  return (
    <div className="mx-auto grid min-h-screen max-w-md place-items-center p-6">
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Gate pass</p>
        {query.isPending && <p className="mt-4">Verifying…</p>}
        {query.isError && <p className="mt-4 font-semibold text-red-600" role="alert">This pass link is invalid.</p>}
        {query.data && (
          <div role={query.data.valid ? 'status' : 'alert'}>
            <p className={`mt-2 text-3xl font-bold ${query.data.valid ? 'text-green-700' : 'text-red-700'}`}>
              {query.data.valid ? '✓ VALID' : '✕ NOT VALID'}
            </p>
            <p className="mt-2 text-lg font-semibold">{query.data.name}</p>
            <p className="text-sm text-muted-foreground">{query.data.kind} · used {query.data.usedCount}/{query.data.maxUses}</p>
          </div>
        )}
      </div>
    </div>
  );
}
