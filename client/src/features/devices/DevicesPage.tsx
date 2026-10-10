import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, EmptyState, ErrorState, Field, Input, PageHeader, ResponsiveTable, Select, TableSkeleton } from '../../components/ui';

interface DeviceItem {
  _id: string;
  deviceId: string;
  name: string;
  type: string;
  status: string;
  health: string;
  lastHeartbeat?: string;
  adapterType: string;
}

interface Paged<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number; }

export function DevicesPage(): JSX.Element {
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['devices', status],
    queryFn: async () => (await api.get('/devices', { params: { pageSize: 50, ...(status ? { status } : {}) } })).data.data as Paged<DeviceItem>,
    refetchInterval: 30000,
  });
  const heartbeat = useMutation({
    mutationFn: async (id: string) => (await api.post(`/devices/${id}/heartbeat`, {})).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Devices"
        subtitle="NFC readers and kiosks. Health derives from heartbeats — stale devices read OFFLINE."
        actions={<Button onClick={() => setCreating(true)}><Plus size={15} /> Register device</Button>}
      />
      <div className="flex gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by health">
          <option value="">All health states</option>
          {['ONLINE', 'OFFLINE', 'WARNING', 'MAINTENANCE'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {query.isPending && <TableSkeleton cols={5} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="No devices" body="Register the kiosk or reader at each gate to track health and heartbeat." action={<Button onClick={() => setCreating(true)}><Plus size={15} /> Register device</Button>} />
      )}
      {query.data && query.data.items.length > 0 && (
        <ResponsiveTable
          label="Devices"
          rows={query.data.items}
          keyOf={(d) => d._id}
          columns={[
            {
              header: 'Device',
              render: (d) => <span className="font-medium">{d.name}<span className="block font-mono text-xs font-normal text-muted-foreground">{d.deviceId}</span></span>,
            },
            { header: 'Type', hideOnMobile: true, render: (d) => <span className="text-muted-foreground">{d.type}</span> },
            { header: 'Adapter', hideOnMobile: true, render: (d) => <span className="font-mono text-xs">{d.adapterType}</span> },
            { header: 'Health', render: (d) => <Badge value={d.health} /> },
            { header: 'Last heartbeat', render: (d) => <span className="text-muted-foreground">{d.lastHeartbeat ? formatDistanceToNow(new Date(d.lastHeartbeat), { addSuffix: true }) : 'never'}</span> },
            {
              header: 'Actions',
              render: (d) => <Button variant="secondary" disabled={heartbeat.isPending} onClick={() => heartbeat.mutate(d._id)}>Ping</Button>,
            },
          ]}
        />
      )}
      {creating && <RegisterDialog onClose={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['devices'] }); }} />}
    </div>
  );
}

function RegisterDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('KIOSK');
  const [adapterType, setAdapterType] = useState('keyboard');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await api.post('/devices', { deviceId: deviceId.toUpperCase(), name, type, adapterType });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Register device">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">Register device</h2>
        <Field label="Device ID" htmlFor="d-id"><Input id="d-id" value={deviceId} onChange={(e) => setDeviceId(e.target.value.toUpperCase())} placeholder="DEV-MAIN-GATE-01" className="font-mono" /></Field>
        <Field label="Name" htmlFor="d-name"><Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Gate Kiosk" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="d-type">
            <Select id="d-type" value={type} onChange={(e) => setType(e.target.value)}>
              {['FIXED', 'HANDHELD', 'KIOSK'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Adapter" htmlFor="d-adapter">
            <Select id="d-adapter" value={adapterType} onChange={(e) => setAdapterType(e.target.value)}>
              {['keyboard', 'bridge', 'pcsc', 'serial', 'network', 'vendor'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={deviceId.trim().length < 3 || name.trim().length < 2 || pending} onClick={submit}>{pending ? 'Registering…' : 'Register'}</Button>
        </div>
      </div>
    </div>
  );
}
