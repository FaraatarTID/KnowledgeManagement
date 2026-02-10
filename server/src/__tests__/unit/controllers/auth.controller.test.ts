import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '../../../controllers/auth.controller.js';
import { authService } from '../../../container.js';
import { Request, Response } from 'express';

// Mock the authService
vi.mock('../../../container.js', () => ({
  authService: {
    validateCredentials: vi.fn(),
    generateToken: vi.fn(),
    getUserById: vi.fn()
  }
}));

describe('AuthController', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let jsonMock: any;
    let statusMock: any;
    let cookieMock: any;
    let clearCookieMock: any;
    let nextMock: any;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        cookieMock = vi.fn();
        clearCookieMock = vi.fn();
        nextMock = vi.fn();

        mockRequest = {};
        mockResponse = {
            status: statusMock,
            json: jsonMock,
            cookie: cookieMock,
            clearCookie: clearCookieMock
        };
        
        vi.clearAllMocks();
    });

    describe('login', () => {
        it('should trigger next with 400 for invalid input format', async () => {
             mockRequest.body = { email: 'not-an-email' }; // Missing password
             
             await AuthController.login(mockRequest as Request, mockResponse as Response, nextMock);
             
             expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        });

        it('should trigger next with 401 for invalid credentials', async () => {
            mockRequest.body = { email: 'test@example.com', password: 'wrong' };
            vi.mocked(authService.validateCredentials).mockResolvedValue(null);

            await AuthController.login(mockRequest as Request, mockResponse as Response, nextMock);

            expect(authService.validateCredentials).toHaveBeenCalledWith('test@example.com', 'wrong');
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
        });

        it('should successfully login and set cookie', async () => {
            const mockUser = { id: '1', email: 'test@example.com', role: 'VIEWER' } as any;
            mockRequest.body = { email: 'test@example.com', password: 'correct' };
            
            vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser);
            vi.mocked(authService.generateToken).mockReturnValue('fake-token');

            await AuthController.login(mockRequest as Request, mockResponse as Response, nextMock);

            expect(statusMock).not.toHaveBeenCalledWith(400);
            expect(statusMock).not.toHaveBeenCalledWith(401);
            expect(cookieMock).toHaveBeenCalledWith('token', 'fake-token', expect.any(Object));
            expect(jsonMock).toHaveBeenCalledWith({ user: mockUser });
        });


    });

    describe('logout', () => {
        it('should clear token cookie', async () => {
            await AuthController.logout(mockRequest as Request, mockResponse as Response, nextMock);
            expect(clearCookieMock).toHaveBeenCalledWith('token');
            expect(jsonMock).toHaveBeenCalledWith({ success: true });
        });
    });

    describe('me', () => {
        it('should return 401 via next if request has no user', async () => {
            await AuthController.me(mockRequest as Request, mockResponse as Response, nextMock);
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
        });

        it('should return user info if authenticated', async () => {
            const reqWithUser = { ...mockRequest, user: { id: '123' } } as any;
            vi.mocked(authService.getUserById).mockResolvedValue({ id: '123', name: 'Test' } as any);

            await AuthController.me(reqWithUser, mockResponse as Response, nextMock);

            expect(authService.getUserById).toHaveBeenCalledWith('123');
            expect(jsonMock).toHaveBeenCalledWith({ id: '123', name: 'Test' });
        });
    });
});
