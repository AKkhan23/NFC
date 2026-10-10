import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

/** Connect (or reconnect) the org-scoped realtime channel with the current access token. */
export function connectSocket(token: string): Socket {
  disconnectSocket();
  socket = io(import.meta.env.VITE_SOCKET_URL ?? window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Subscribe to a socket event; handler ref stays fresh without resubscribing. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const wrapped = (p: T): void => handler(p);
    s.on(event, wrapped);
    return () => {
      s.off(event, wrapped);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

/** Keep the socket lifecycle tied to auth state. Place once near the app root. */
export function useSocketLifecycle(): void {
  const token = useAuthStore((s) => s.accessToken);
  useEffect(() => {
    if (token) connectSocket(token);
    else disconnectSocket();
    return () => disconnectSocket();
  }, [token]);
}
