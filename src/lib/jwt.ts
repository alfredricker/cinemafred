// src/utils/jwt.ts
export function generateToken(payload: any, secret: string): string {
    return btoa(JSON.stringify({
      ...payload,
      exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    }));
  }
  
  export function verifyJWT(token: string, secret: string): any {
    try {
      const decoded = JSON.parse(atob(token));
      if (decoded.exp < Date.now()) {
        throw new Error('Token expired');
      }
      return decoded;
    } catch {
      throw new Error('Invalid token');
    }
  }