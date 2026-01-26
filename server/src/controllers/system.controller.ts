import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { 
  geminiService, 
  driveService, 
  vectorService, 
  userService, 
  auditService, 
  configService 
} from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

export class SystemController {
  
  static async health(req: AuthRequest, res: Response) {
    const geminiHealth = await geminiService.checkHealth();
    const driveHealth = await driveService.checkHealth();
    const vectorCount = vectorService.getVectorCount();

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
  }

  static async syncStatus(req: Request, res: Response) {
    const STATUS_FILE = path.join(process.cwd(), 'data', 'sync_status.json');
    try {
      if (fs.existsSync(STATUS_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
        res.json(data);
      } else {
        res.json({});
      }
    } catch (e) {
      res.status(500).json({ error: 'Failed to read sync status' });
    }
  }

  static async stats(req: AuthRequest, res: Response) {
    try {
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
        systemHealth = 'Critical'; // Any error is critical for now
      } else if (healthChecks.some(h => h.message?.includes('Mock'))) {
        systemHealth = 'Warning'; // Mock mode is a warning (demo only)
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
    } catch (error) {
      console.error('Stats aggregation failed', error);
      res.status(500).json({ error: 'Failed to aggregate system stats' });
    }
  }

  static async getConfig(req: Request, res: Response) {
    res.json(configService.getConfig());
  }

  static async updateCategories(req: AuthRequest, res: Response) {
    // Access check handled by middleware or verify here just in case? 
    // Middleware in routes handles Admin check.
    const { categories } = req.body;
    if (!Array.isArray(categories)) return res.status(400).json({ error: 'Invalid categories format' });
    configService.updateCategories(categories);
    res.json({ success: true, categories: configService.getConfig().categories });
  }

  static async updateDepartments(req: AuthRequest, res: Response) {
    const { departments } = req.body;
    if (!Array.isArray(departments)) return res.status(400).json({ error: 'Invalid departments format' });
    configService.updateDepartments(departments);
    res.json({ success: true, departments: configService.getConfig().departments });
  }

  static async ping(req: Request, res: Response) {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
  }
}
