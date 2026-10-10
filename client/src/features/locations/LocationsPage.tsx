import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '../../components/ui';

interface Gate { _id: string; name: string; code: string; direction: string; status: string; }
interface Zone { _id: string; name: string; code: string; gates: Gate[]; }
interface LocNode { _id: string; name: string; code: string; timezone: string; zones: Zone[]; gates: Gate[]; }

export function LocationsPage(): JSX.Element {
  const [creating, setCreating] = useState<'location' | 'zone' | 'gate' | null>(null);
  const queryClient = useQueryClient();
  const tree = useQuery({
    queryKey: ['location-tree'],
    queryFn: async () => (await api.get('/locations/tree')).data.data as LocNode[],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['location-tree'] });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Locations"
        subtitle="Organization → location → zone → gate hierarchy."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating('zone')}>Add zone</Button>
            <Button variant="secondary" onClick={() => setCreating('gate')}>Add gate</Button>
            <Button onClick={() => setCreating('location')}><Plus size={15} /> Add location</Button>
          </>
        }
      />
      {tree.isPending && <Skeleton className="h-48 w-full" />}
      {tree.isError && <ErrorState message={(tree.error as Error).message} onRetry={() => tree.refetch()} />}
      {tree.data && tree.data.length === 0 && (
        <EmptyState title="No locations" body="Add your first campus or venue, then zones and gates beneath it." />
      )}
      {tree.data?.map((l) => (
        <Card key={l._id}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{l.name} <span className="font-mono text-xs text-muted-foreground">{l.code} · {l.timezone}</span></h2>
          </div>
          {l.zones.map((z) => (
            <div key={z._id} className="ml-4 mt-3 border-l-2 border-border pl-3">
              <p className="text-sm font-medium">{z.name} <span className="font-mono text-xs text-muted-foreground">{z.code}</span></p>
              {z.gates.map((g) => (
                <p key={g._id} className="ml-4 mt-1 text-sm text-muted-foreground">
                  {g.name} <span className="font-mono text-xs">{g.code}</span> · {g.direction} <Badge value={g.status} />
                </p>
              ))}
              {z.gates.length === 0 && <p className="ml-4 text-xs text-muted-foreground">No gates yet.</p>}
            </div>
          ))}
          {l.gates.map((g) => (
            <p key={g._id} className="ml-4 mt-2 text-sm text-muted-foreground">
              {g.name} <span className="font-mono text-xs">{g.code}</span> · {g.direction} <Badge value={g.status} />
            </p>
          ))}
          {l.zones.length === 0 && l.gates.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No zones or gates yet.</p>}
        </Card>
      ))}
      {creating && <CreateDialog kind={creating} locations={tree.data ?? []} onClose={() => { setCreating(null); refresh(); }} />}
    </div>
  );
}

function CreateDialog({ kind, locations, onClose }: { kind: 'location' | 'zone' | 'gate'; locations: LocNode[]; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?._id ?? '');
  const [zoneId, setZoneId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const zones = locations.find((l) => l._id === locationId)?.zones ?? [];

  const titles = { location: 'Add location', zone: 'Add zone', gate: 'Add gate' } as const;
  const paths = { location: '/locations', zone: '/locations/zones', gate: '/locations/gates' } as const;

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = { name, code: code.toUpperCase() };
      if (kind !== 'location') body.locationId = locationId;
      if (kind === 'gate' && zoneId) body.zoneId = zoneId;
      await api.post(paths[kind], body);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={titles[kind]}>
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">{titles[kind]}</h2>
        {kind !== 'location' && (
          <Field label="Location" htmlFor="loc-sel">
            <Select id="loc-sel" value={locationId} onChange={(e) => { setLocationId(e.target.value); setZoneId(''); }}>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </Select>
          </Field>
        )}
        {kind === 'gate' && zones.length > 0 && (
          <Field label="Zone (optional)" htmlFor="zone-sel">
            <Select id="zone-sel" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">No zone (gate directly under location)</option>
              {zones.map((z) => <option key={z._id} value={z._id}>{z.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="n-name"><Input id="n-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Code" htmlFor="n-code"><Input id="n-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" /></Field>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={name.trim().length < 2 || code.trim().length < 2 || pending} onClick={submit}>
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
