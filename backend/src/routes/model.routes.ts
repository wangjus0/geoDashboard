import { Router } from 'express';
import {
  getRecentQueriesHandler,
  runScanHandler,
} from '../controllers/model.controller';

const router = Router();

router.post('/scan', runScanHandler);
router.get('/recent-queries', getRecentQueriesHandler);

export default router;
