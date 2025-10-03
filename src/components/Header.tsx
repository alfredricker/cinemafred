// src/components/Header.tsx
'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CreateUserDialog } from '@/components/account/CreateUserDialog';
import { CreateMovieForm } from '@/components/forms/CreateMovieForm';
import { AccountDialog } from '@/components/account/AccountDialog';
import { UserPlus, LogOut, Film, User, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export const Header = () => {
  const { user, logout } = useAuth();
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreateMovieOpen, setIsCreateMovieOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    // can include border-b border-gray-800 in className = 
    <header className="py-4 px-16">
      <div className="max-w-[128rem] mx-auto flex items-center justify-between">
        <Link 
          href="/" 
          className="text-xl font-bold text-white hover:text-blue-400 transition-colors"
        >
          CinemaFred
        </Link>
        
        <div className="flex items-center gap-4">
          {user?.isAdmin ? (
            <>
              <button
                onClick={() => setIsCreateMovieOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors"
              >
                <Film className="w-4 h-4" />
                <span className="text-sm">Add Movie</span>
              </button>
              <button
                onClick={() => setIsCreateUserOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-sm">Create User</span>
              </button>
            </>
          ) : !user?.isGuest && !user?.isAdmin && (
            <>
            <Link href="/ratings" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors">
              <Star className="w-4 h-4" />
              <span className="text-sm">Ratings</span>
            </Link>
            <button
              onClick={() => setIsAccountOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors"
            >
              <User className="w-4 h-4" />
              <span className="text-sm">Account</span>
            </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Log out</span>
          </button>
        </div>

        {/* Dialogs */}
        <CreateUserDialog 
          isOpen={isCreateUserOpen} 
          onClose={() => setIsCreateUserOpen(false)} 
        />
        <CreateMovieForm
          isOpen={isCreateMovieOpen}
          onClose={() => setIsCreateMovieOpen(false)}
        />
        <AccountDialog
          isOpen={isAccountOpen}
          onClose={() => setIsAccountOpen(false)}
        />
      </div>
    </header>
  );
};