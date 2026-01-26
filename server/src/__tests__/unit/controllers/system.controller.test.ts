import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemController } from '../../../controllers/system.controller.js';
import { geminiService, driveService, vectorService, userService, auditService } from '../../../container.js';

vi.mock('../../../container.js', () => ({
  geminiService: { checkHealth: vi.fn() },
  driveService: { checkHealth: vi.fn() },
  vectorService: { 
      getVectorCount: vi.fn(), 
      checkHealth: vi.fn(),
      getAllMetadata: vi.fn()
  },
  userService: { 
      getAll: vi.fn(),
      checkHealth: vi.fn()
  },
  auditService: { getResolutionStats: vi.fn() },
  configService: { getConfig: vi.fn(), updateCategories: vi.fn(), updateDepartments: vi.fn() }
}));

describe('SystemController', () => {
    let mockRequest: any;
    let mockResponse: any;
    let jsonMock: any;
    let statusMock: any;
    let nextMock: any;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        nextMock = vi.fn();

        mockRequest = {};
        mockResponse = {
            status: statusMock,
            json: jsonMock
        };
        vi.clearAllMocks();
    });

    describe('health', () => {
        it('should display health of services', async () => {
            vi.mocked(geminiService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(driveService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(vectorService.getVectorCount).mockResolvedValue(10);

            await SystemController.health(mockRequest, mockResponse, nextMock);

            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                status: 'online',
                services: expect.objectContaining({
                    gemini: { status: 'OK' },
                    drive: { status: 'OK' }
                }),
                vectors: { count: 10 }
            }));
        });
    });

    describe('stats', () => {
        it('should aggregate stats correctly', async () => {
            vi.mocked(userService.getAll).mockResolvedValue([{}, {}] as any);
            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({ '1': {}, '2': {}, '3': {} } as any);
            vi.mocked(vectorService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(geminiService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(driveService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(userService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(auditService.getResolutionStats).mockResolvedValue({ percentage: '95%' });

            await SystemController.stats(mockRequest, mockResponse, nextMock);

            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                totalDocuments: 3,
                activeUsers: 2,
                aiResolution: '95%',
                systemHealth: 'Optimal'
            }));
        });

        it('should report Critical health if any service fails', async () => {
            vi.mocked(userService.getAll).mockResolvedValue([] as any);
            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({} as any);
            vi.mocked(vectorService.checkHealth).mockResolvedValue({ status: 'ERROR' }); 
            // others OK mocks need to be present or Promise.all fails? actually Promise.all waits, but implementation doesn't fail fast.
            // But we need to mock all to avoid undefined.
            vi.mocked(geminiService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(driveService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(userService.checkHealth).mockResolvedValue({ status: 'OK' });
            vi.mocked(auditService.getResolutionStats).mockResolvedValue({ percentage: '0%' });

            await SystemController.stats(mockRequest, mockResponse, nextMock);

            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                systemHealth: 'Critical'
            }));
        });
    });
});
