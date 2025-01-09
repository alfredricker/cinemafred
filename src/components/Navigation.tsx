'use client';
import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export const Navigation: React.FC = () => {
  const { user } = useAuth();
  
  return (
    <nav>
      <ul className="flex gap-6">
        <li>
          <Link href="/" className="hover:text-blue-300 transition-colors">
            Home
          </Link>
        </li>
        <li>
          <Link href="/top-rated" className="hover:text-blue-300 transition-colors">
            Top Rated
          </Link>
        </li>
        <li>
          <Link href="/genres" className="hover:text-blue-300 transition-colors">
            Genres
          </Link>
        </li>
        {user?.isAdmin && (
          <li>
            <Link href="/admin/users" className="hover:text-blue-300 transition-colors">
              User Management
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
};