import type { Server } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';

let io: SocketServer | null = null;

export function initSockets(httpServer: Server): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('unauthorized'));
      const p = verifyAccessToken(token);
      socket.data.auth = { userId: p.sub, organizationId: p.org, role: p.role };
      // Org-scoped room: clients only receive their own org's events.
      socket.join(`org:${p.org}`);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ sid: socket.id, org: socket.data.auth?.organizationId }, 'socket connected');
    socket.on('disconnect', () => logger.info({ sid: socket.id }, 'socket disconnected'));
  });

  return io;
}

export function emitToOrg(organizationId: string, event: string, payload: unknown): void {
  io?.to(`org:${organizationId}`).emit(event, payload);
}
