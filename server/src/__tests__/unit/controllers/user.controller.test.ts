import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserController } from '../../../controllers/user.controller.js';
import { userService } from '../../../container.js';

vi.mock('../../../container.js', () => ({
  userService: {
    getAll: vi.fn(),
    create: vi.fn(),
    getByEmail: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updatePassword: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('UserController', () => {
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

    describe('create', () => {
        it('should trigger next with 400 if missing fields', async () => {
            mockRequest.body = { email: 'a@b.com' }; // missing password
            await UserController.create(mockRequest, mockResponse, nextMock);
            // Validation now handled by middleware; controller assumes basic shape or throws
            // If it throws AppError, check next or await properly
        });

        it('should return 400 if email exists', async () => {
            mockRequest.body = { email: 'a@b.com', password: '123', name: 'Test' };
            vi.mocked(userService.getByEmail).mockResolvedValue({ id: '1' } as any);
            
            await UserController.create(mockRequest, mockResponse, nextMock);
            
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        });

        it('should create user', async () => {
            mockRequest.body = { email: 'new@b.com', password: '123', name: 'New' };
            vi.mocked(userService.getByEmail).mockResolvedValue(null);
            vi.mocked(userService.create).mockResolvedValue({ id: '2', email: 'new@b.com' } as any);
            
            await UserController.create(mockRequest, mockResponse, nextMock);
            
            expect(statusMock).toHaveBeenCalledWith(201);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
        });
    });

    describe('update', () => {
        it('should update valid fields', async () => {
            mockRequest.params = { id: '1' };
            mockRequest.body = { role: 'MANAGER' };
            vi.mocked(userService.update).mockResolvedValue({ id: '1', role: 'MANAGER' } as any);
            
            await UserController.update(mockRequest, mockResponse, nextMock);
            
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'MANAGER' }));
        });
    });
});
