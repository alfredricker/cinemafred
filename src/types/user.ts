//src/types/user.ts
export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  isAdmin: boolean;
  dateCreated: Date;
  mustResetPassword?: boolean;  // Optional field
}

export interface UserResponse {
  id: string;
  email: string;
  username: string;  // Added username
  isAdmin: boolean;
  isActive: boolean;
  mustResetPassword?: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
    error?: string; 
  }