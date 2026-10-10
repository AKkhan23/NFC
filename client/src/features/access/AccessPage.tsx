import { useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, ResponsiveTable, Select, TableSkeleton } from '../../components/ui';
import { useAccessEvents, useAccessRules, useCreateRule, useUpdateRule } from './accessApi';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function AccessPage(): JSX.Element {
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('access.manage');
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState('');

  const rules = useAccessRules();
  const events = useAccessEvents(decision || undefined);
  const update = useUpdateRule();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Access Control"
        subtitle="Rules decide every ENTRY scan. DENY rules always win; no match means deny."
        actions={canManage ? <Button onClick={() => setCreating(true)}><Plus size={15} /> New rule</Button> : undefined}
      />

      <Card>
        <h2 className="mb-3 font-semibold">Access rules</h2>
        {rules.isPending && <TableSkeleton cols={5} />}
        {rules.isError && <ErrorState message={(rules.error as Error).message} onRetry={() => rules.refetch()} />}
        {rules.data && rules.data.items.length === 0 && (
          <EmptyState title="No access rules" body="Without rules, every ENTRY scan is denied. Create your first rule to open a gate." />
        )}
        {rules.data && rules.data.items.length > 0 && (
          <ResponsiveTable
            framed={false}
            label="Access rules"
            rows={rules.data.items}
            keyOf={(r) => r._id}
            columns={[
              { header: 'Rule', render: (r) => <span className="font-medium">{r.name}<span className="ml-2 text-xs font-normal text-muted-foreground">prio {r.priority}</span></span> },
              { header: 'Scope', hideOnMobile: true, render: (r) => <span className="text-muted-foreground text-xs">{r.gateId ? `gate ${r.gateId.slice(-6)}` : r.locationId ? `loc ${r.locationId.slice(-6)}` : 'global'}</span> },
              { header: 'Window', render: (r) => <span className="text-xs">{r.days.length === 7 ? 'Daily' : r.days.join(',')} {r.startTime}–{r.endTime}</span> },
              { header: 'Effect', render: (r) => <Badge value={r.effect} /> },
              { header: 'Status', render: (r) => <Badge value={r.status} /> },
              ...(canManage ? [{
                header: 'Actions',
                render: (r: (typeof rules.data.items)[number]) => (
                  <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: r._id, body: { status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } })}>
                    {r.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                  </Button>
                ),
              }] : []),
            ]}
          />
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Recent access events</h2>
          <Select value={decision} onChange={(e) => setDecision(e.target.value)} aria-label="Filter by decision">
            <option value="">All</option>
            <option value="ALLOW">Allowed</option>
            <option value="DENY">Denied</option>
          </Select>
        </div>
        {events.isPending && <TableSkeleton cols={4} />}
        {events.data && events.data.items.length === 0 && <p className="text-sm text-muted-foreground">No access events yet.</p>}
        {events.data && events.data.items.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {events.data.items.map((e) => (
              <li key={e._id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {e.direction} · <span className="text-muted-foreground">{format(new Date(e.timestamp), 'PP p')}</span>
                  {e.reason && <span className="block text-xs text-muted-foreground">{e.reason}</span>}
                </span>
                <Badge value={e.decision} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && <CreateRuleDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateRuleDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [days, setDays] = useState<string[]>([...DAYS]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [groups, setGroups] = useState('');
  const create = useCreateRule();

  function toggleDay(d: string): void {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="New access rule">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">New access rule</h2>
        <p className="text-xs text-muted-foreground">Global rule (all gates). Gate/location scoping pickers arrive with device management.</p>
        <Field label="Name" htmlFor="ar-name"><Input id="ar-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main gate mornings" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Effect" htmlFor="ar-effect">
            <Select id="ar-effect" value={effect} onChange={(e) => setEffect(e.target.value as 'ALLOW' | 'DENY')}>
              <option value="ALLOW">ALLOW</option>
              <option value="DENY">DENY</option>
            </Select>
          </Field>
          <Field label="Groups (comma-separated roles, blank = everyone)" htmlFor="ar-groups">
            <Input id="ar-groups" value={groups} onChange={(e) => setGroups(e.target.value)} placeholder="OPERATOR, STAFF" />
          </Field>
        </div>
        <Field label="Days" htmlFor="ar-days">
          <div className="flex flex-wrap gap-1.5" id="ar-days" role="group" aria-label="Days">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className={`rounded-md border px-2 py-1 text-xs ${days.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" htmlFor="ar-start"><Input id="ar-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
          <Field label="End" htmlFor="ar-end"><Input id="ar-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
        </div>
        {create.isError && <p className="text-sm text-red-600" role="alert">{(create.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={name.trim().length < 3 || days.length === 0 || create.isPending}
            onClick={() => create.mutate({
              name: name.trim(),
              effect,
              days,
              startTime,
              endTime,
              userGroups: groups.split(',').map((g) => g.trim().toUpperCase()).filter(Boolean),
            }, { onSuccess: onClose })}
          >
            {create.isPending ? 'Creating…' : 'Create rule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
