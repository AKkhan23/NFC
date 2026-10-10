import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebounced } from '../../hooks/hooks';
import { Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';
import { useBandAction, useRegisterBand } from './bandsApi';

interface UserRow { _id: string; firstName: string; lastName: string; email: string; }

const TYPES = ['STUDENT', 'STAFF', 'VISITOR', 'VENDOR', 'VIP', 'TEMPORARY'];
const UID_RE = /^(?:[0-9A-Fa-f]{2}:){3,}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{8,24}$/;

export function IssueBandPage(): JSX.Element {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [nfcUid, setNfcUid] = useState('');
  const [type, setType] = useState('STUDENT');
  const [bandId, setBandId] = useState('');
  const [created, setCreated] = useState<{ _id: string; bandId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const debounced = useDebounced(userSearch, 250);

  const users = useQuery({
    queryKey: ['issue-users', debounced],
    queryFn: async () => (await api.get('/users', { params: { search: debounced, pageSize: 8 } })).data.data.items as UserRow[],
    enabled: step === 1 && debounced.length >= 1,
  });

  const register = useRegisterBand();
  const assign = useBandAction('assign');
  const activate = useBandAction('activate');

  const uidValid = UID_RE.test(nfcUid.trim());

  async function finish(): Promise<void> {
    setError(null);
    setWorking(true);
    try {
      const reg = await register.mutateAsync({
        nfcUid: nfcUid.trim().toUpperCase(),
        type,
        ...(bandId.trim() ? { bandId: bandId.trim().toUpperCase() } : {}),
      });
      await assign.mutateAsync({ id: reg._id, body: { userId } });
      await activate.mutateAsync({ id: reg._id });
      setCreated({ _id: reg._id, bandId: reg.bandId });
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Issue failed');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Issue Band" subtitle={`Step ${Math.min(step, 3)} of 3: ${step === 1 ? 'Select user' : step === 2 ? 'Scan NFC' : step === 3 ? 'Review' : 'Done'}`} />

      {step === 1 && (
        <Card className="space-y-3">
          <Field label="Find user" htmlFor="iu-search">
            <Input id="iu-search" placeholder="Type a name or email…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
          </Field>
          <ul className="divide-y divide-border">
            {(users.data ?? []).map((u) => (
              <li key={u._id}>
                <button
                  onClick={() => { setUserId(u._id); setUserLabel(`${u.firstName} ${u.lastName} (${u.email})`); }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${userId === u._id ? 'bg-muted font-medium' : ''}`}
                >
                  <span>{u.firstName} {u.lastName}</span>
                  <span className="text-muted-foreground">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
          {userId && <p className="text-sm">Selected: <strong>{userLabel}</strong></p>}
          <div className="flex justify-end"><Button disabled={!userId} onClick={() => setStep(2)}>Continue</Button></div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <Field label="NFC UID (type it, or place the band on a keyboard-mode reader while focused here)" error={nfcUid !== '' && !uidValid ? 'Invalid UID format' : undefined} htmlFor="iu-uid">
            <Input
              id="iu-uid"
              autoFocus
              placeholder="e.g. 04:A3:F1:9C:2B:80"
              value={nfcUid}
              onChange={(e) => setNfcUid(e.target.value.toUpperCase())}
              className="font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Band ID (optional — auto-allocated)" htmlFor="iu-band">
              <Input id="iu-band" placeholder="NF-4821" value={bandId} onChange={(e) => setBandId(e.target.value.toUpperCase())} className="font-mono" />
            </Field>
            <Field label="Type" htmlFor="iu-type">
              <Select id="iu-type" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={!uidValid} onClick={() => setStep(3)}>Review</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Review</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">User</dt><dd className="font-medium">{userLabel}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">NFC UID</dt><dd className="font-mono font-medium">{nfcUid.trim().toUpperCase()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Band ID</dt><dd className="font-medium">{bandId.trim() || 'Auto-allocate'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Type</dt><dd className="font-medium">{type}</dd></div>
          </dl>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button disabled={working} onClick={finish}>{working ? 'Issuing…' : 'Confirm & activate'}</Button>
          </div>
        </Card>
      )}

      {step === 4 && created && (
        <Card className="space-y-3 text-center">
          <CheckCircle2 size={40} className="mx-auto text-green-600" aria-hidden />
          <h2 className="text-xl font-semibold">✓ BAND ACTIVATED</h2>
          <dl className="mx-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Band</dt><dd className="font-mono font-medium">{created.bandId}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">User</dt><dd className="font-medium">{userLabel}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd className="font-medium text-green-700">ACTIVE</dd></div>
          </dl>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => nav('/bands')}>Back to bands</Button>
            <Button onClick={() => nav(`/bands/${created._id}`)}>View band</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
