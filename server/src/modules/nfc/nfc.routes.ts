import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { nfcController } from './nfc.controller.js';
import { listScansSchema, scanSchema, tapSchema } from './nfc.validators.js';

export const nfcRoutes = Router();

// Public: phone-tap link check-in (token is the credential, no login).
nfcRoutes.post('/tap', validate(tapSchema), nfcController.tap);

nfcRoutes.use(requireAuth);
nfcRoutes.post('/scan', requirePerm('nfc.scan'), validate(scanSchema), nfcController.scan);
nfcRoutes.get('/scans', requirePerm('nfc.scan'), validate(listScansSchema), nfcController.list);
