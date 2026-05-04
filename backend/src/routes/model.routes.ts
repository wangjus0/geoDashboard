import { Router } from 'express';
import {
  getOverallProgressHandler,
  getRecentQueriesHandler,
  runScanHandler,
} from '../controllers/model.controller.js';

const router = Router();

router.post('/scan', runScanHandler);
router.get('/recent-queries', getRecentQueriesHandler);
router.get('/overall-summary', getOverallProgressHandler);

export default router;
