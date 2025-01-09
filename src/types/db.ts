// src/types/db.ts
export interface DBUser {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    isActive: number;
    isAdmin: number;
    dateCreated: string;
  }

  export function isDBUser(obj: any): obj is DBUser {
    return (
      typeof obj.id === 'string' &&
      typeof obj.email === 'string' &&
      typeof obj.username === 'string' &&
      typeof obj.passwordHash === 'string' &&
      typeof obj.isActive === 'number' &&
      typeof obj.isAdmin === 'number' &&
      typeof obj.dateCreated === 'string'
    );
  }