import { Router } from 'express';
import { runDailyScanHandler } from '../controllers/cron.controller.js';

const router = Router();

router.get('/daily-scan', runDailyScanHandler);

export default router;
