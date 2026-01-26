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
    updatePassword: vi.fn()
  }
}));

describe('UserController', () => {
    let mockRequest: any;
    let mockResponse: any;
    let jsonMock: any;
    let statusMock: any;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });

        mockRequest = {};
        mockResponse = {
            status: statusMock,
            json: jsonMock
        };
        vi.clearAllMocks();
    });

    describe('create', () => {
        it('should return 400 if missing fields', async () => {
            mockRequest.body = { email: 'a@b.com' }; // missing password
            await UserController.create(mockRequest, mockResponse);
            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it('should return 400 if email exists', async () => {
            mockRequest.body = { email: 'a@b.com', password: '123', name: 'Test' };
            vi.mocked(userService.getByEmail).mockResolvedValue({ id: '1' } as any);
            
            await UserController.create(mockRequest, mockResponse);
            
            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('exists') }));
        });

        it('should create user', async () => {
            mockRequest.body = { email: 'new@b.com', password: '123', name: 'New' };
            vi.mocked(userService.getByEmail).mockResolvedValue(null);
            vi.mocked(userService.create).mockResolvedValue({ id: '2', email: 'new@b.com' } as any);
            
            await UserController.create(mockRequest, mockResponse);
            
            expect(statusMock).toHaveBeenCalledWith(201);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
        });
    });

    describe('update', () => {
        it('should update valid fields', async () => {
            mockRequest.params = { id: '1' };
            mockRequest.body = { role: 'MANAGER' };
            vi.mocked(userService.update).mockResolvedValue({ id: '1', role: 'MANAGER' } as any);
            
            await UserController.update(mockRequest, mockResponse);
            
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'MANAGER' }));
        });
    });
});
