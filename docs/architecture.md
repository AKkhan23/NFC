# Architecture

```
React Admin UI ──REST──> Node+Express API ──┬──> MongoDB
                                            ├──> Socket.IO (org rooms: org:{id})
                                            └──> NFC Service ──> Reader / Bridge
Operator/Kiosk UI ──REST──> same API (perm: nfc.scan)
```

- Modular backend: `server/src/modules/<domain>/{model,validators,service,controller,routes}`.
- Thin controllers, business logic in services.
- Auth: JWT access (Bearer) + rotating refresh sessions; org derived from token, never client input.
- Realtime: Socket.IO, clients join `org:{id}`, server emits scan/attendance/access/device/transaction/notification events.
```

