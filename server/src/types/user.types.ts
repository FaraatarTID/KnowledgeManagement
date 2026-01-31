export type UserRole = 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';
export type UserStatus = 'Active' | 'Inactive';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  department?: string;
}

export interface UpdateUserDTO {
  name?: string;
  role?: UserRole;
  department?: string;
  status?: UserStatus;
}
