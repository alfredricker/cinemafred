import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// List of protected API routes that should not be accessible from the public subdomain or guest users
const PROTECTED_ROUTES = [
  '/api/auth',
  '/api/movies/[id]/rate',
  '/api/stream',
  '/api/users',
  '/api/reviews'
];

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  
  // Check if the request is coming from the public subdomain
  const isPublicSubdomain = hostname.startsWith('public.');
  
  // Check if the user is a guest
  const isGuest = request.cookies.get('isGuest')?.value === 'true';
  
  // If it's the public subdomain or a guest user trying to access a protected route
  if (isPublicSubdomain || isGuest) {
    for (const route of PROTECTED_ROUTES) {
      if (url.pathname.startsWith(route)) {
        return NextResponse.json(
          { error: 'This functionality is not available for guest users' },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 