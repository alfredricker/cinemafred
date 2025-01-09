// src/lib/middleware.ts
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { headers } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

interface ValidationRules {
  [key: string]: ValidationRule;
}

export async function validateAdmin(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { isAdmin: boolean };
    if (!decoded.isAdmin) {
      return { error: 'Forbidden', status: 403 };
    }
    return { user: decoded };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

export function validateInput(data: any, rules: ValidationRules) {
  const errors: { [key: string]: string } = {};

  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors[field] = `${field} is required`;
      continue;
    }

    // Skip other validations if value is empty and not required
    if (!rule.required && !value) continue;

    // String length checks
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        errors[field] = `${field} must be at least ${rule.minLength} characters`;
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        errors[field] = `${field} must be no more than ${rule.maxLength} characters`;
      }
    }

    // Pattern check
    if (rule.pattern && !rule.pattern.test(value)) {
      errors[field] = `${field} format is invalid`;
    }

    // Custom validation
    if (rule.custom) {
      const result = rule.custom(value);
      if (typeof result === 'string') {
        errors[field] = result;
      } else if (!result) {
        errors[field] = `${field} is invalid`;
      }
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}