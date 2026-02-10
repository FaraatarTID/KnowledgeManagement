import type { Request, Response, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import { 
  geminiService, 
  driveService, 
  vectorService, 
  userService, 
  auditService, 
  configService,
  backupService
} from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { Logger } from '../utils/logger.js';
import { catchAsync } from '../utils/catchAsync.js';

export class SystemController {

  static cloudBackup: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    Logger.info('SystemController: Cloud backup triggered manually');
    const result = await backupService.backupToCloud();
    if (result.success) {
      res.json({ success: true, fileId: result.fileId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  });

  static health: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const geminiHealth = await geminiService.checkHealth();
    const driveHealth = await driveService.checkHealth();
    const vectorCount = await vectorService.getVectorCount();

    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      services: {
        gemini: geminiHealth,
        drive: driveHealth
      },
      vectors: {
        count: vectorCount
      }
    });
  });

  static syncStatus: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const STATUS_FILE = path.join(process.cwd(), 'data', 'sync_status.json');
    if (fs.existsSync(STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
      res.json(data);
    } else {
      res.json({});
    }
  });

  static stats: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const [users, vectorMeta, vectorHealth, geminiHealth, driveHealth, userHealth, resStats] = await Promise.all([
      userService.getAll(),
      vectorService.getAllMetadata(),
      vectorService.checkHealth(),
      geminiService.checkHealth(),
      driveService.checkHealth(),
      userService.checkHealth(),
      auditService.getResolutionStats()
    ]);

    const docCount = Object.keys(vectorMeta).length;
    
    // Aggregate health status
    const healthChecks = [vectorHealth, geminiHealth, driveHealth, userHealth];
    const errors = healthChecks.filter(h => h.status === 'ERROR');
    
    let systemHealth = 'Optimal';
    if (errors.length > 0) {
      systemHealth = 'Critical';
    } else if (healthChecks.some(h => h.message?.includes('Mock'))) {
      systemHealth = 'Warning';
    }

    res.json({
      totalDocuments: docCount,
      activeUsers: users.length,
      aiResolution: resStats.percentage,
      systemHealth,
      details: {
        vector: vectorHealth,
        gemini: geminiHealth,
        drive: driveHealth,
        identity: userHealth
      }
    });
  });

  static getConfig: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    res.json(configService.getConfig());
  });

  static updateCategories: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const { categories } = req.body;
    configService.updateCategories(categories);
    Logger.info('Global categories updated', { count: categories.length });
    res.json({ success: true, categories: configService.getConfig().categories });
  });

  static updateDepartments: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const { departments } = req.body;
    configService.updateDepartments(departments);
    Logger.info('Global departments updated', { count: departments.length });
    res.json({ success: true, departments: configService.getConfig().departments });
  });

  static ping: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
  });
}
