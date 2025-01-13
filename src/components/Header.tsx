// src/components/Header.tsx
'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CreateUserDialog } from './CreateUserDialog';
import { CreateMovieForm } from './CreateMovieForm';
import { AccountDialog } from './AccountDialog';
import { UserPlus, LogOut, Film, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SortSelect } from './SortSelect';
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
    <header className="py-4 px-16">
      <div className="max-w-[98rem] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link 
            href="/" 
            className="text-xl font-bold hover:text-blue-400 transition-colors"
          >
            CinemaFred
          </Link>
          <SortSelect />
        </div>
        
        <div className="flex items-center gap-4">
          {user?.isAdmin ? (
            <>
              <button
                onClick={() => setIsCreateMovieOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/30 transition-colors"
              >
                <Film className="w-4 h-4" />
                <span className="text-sm">Add Movie</span>
              </button>
              <button
                onClick={() => setIsCreateUserOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/30 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-sm">Create User</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsAccountOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/30 transition-colors"
            >
              <User className="w-4 h-4" />
              <span className="text-sm">Account</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/30 transition-colors"
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