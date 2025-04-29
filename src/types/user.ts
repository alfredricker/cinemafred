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
  isGuest?: boolean;
}

export interface UserResponse {
  id: string;
  email: string;
  username: string;  // Added username
  isAdmin: boolean;
  isActive: boolean;
  mustResetPassword: boolean;
  isGuest: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
    error?: string; 
  }