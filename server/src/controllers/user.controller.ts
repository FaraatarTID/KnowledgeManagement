import { Request, Response } from 'express';
import { userService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

export class UserController {
  static async list(req: AuthRequest, res: Response) {
    const users = await userService.getAll();
    res.json(users);
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { email, password, name, role, department } = req.body;
      
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password and name are required' });
      }

      // Check if user already exists
      const existing = await userService.getByEmail(email);
      if (existing) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const newUser = await userService.create({
        email,
        password,
        name,
        role: role || 'VIEWER',
        department: department || 'General'
      });

      if (!newUser) {
        return res.status(500).json({ error: 'Failed to create user' });
      }

      res.status(201).json(newUser);
    } catch (error) {
      console.error('User creation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { role, status, department } = req.body;
    
    // Validate role value if provided
    const validRoles = ['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
    
    const updatedUser = await userService.update(id as string, { role, status, department });
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(updatedUser);
  }

  static async delete(req: AuthRequest, res: Response) {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'User ID is required' });
    
    const success = await userService.delete(id);
    if (!success) {
      return res.status(404).json({ error: 'User not found or deletion failed' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  }

  static async updatePassword(req: AuthRequest, res: Response) {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'User ID is required' });

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'New password is required' });
    }
    const success = await userService.updatePassword(id, password);
    if (!success) {
      return res.status(404).json({ error: 'User not found or update failed' });
    }
    res.json({ success: true, message: 'Password updated successfully' });
  }
}
