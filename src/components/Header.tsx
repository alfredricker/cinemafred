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
import Image from 'next/image';

const navItemClass = 'flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 rounded-lg text-white hover:text-blue-400 transition-colors';
const navLabelClass = 'hidden sm:inline text-sm';

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
    <header className="py-3 sm:py-4 px-4 sm:px-6 lg:px-16">
      <div className="max-w-[128rem] mx-auto flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
        >
          <Image src="/cinemafred.svg" alt="CinemaFred" height={32} width={57} className="flex-shrink-0" />
          <span className="text-lg sm:text-xl font-bold text-white truncate">CinemaFred</span>
        </Link>
        
        <div className="flex items-center gap-1 sm:gap-4 flex-shrink-0">
          {user?.isAdmin ? (
            <>
              <button
                onClick={() => setIsCreateMovieOpen(true)}
                className={navItemClass}
                aria-label="Add Movie"
              >
                <Film className="w-4 h-4" />
                <span className={navLabelClass}>Add Movie</span>
              </button>
              <button
                onClick={() => setIsCreateUserOpen(true)}
                className={navItemClass}
                aria-label="Create User"
              >
                <UserPlus className="w-4 h-4" />
                <span className={navLabelClass}>Create User</span>
              </button>
            </>
          ) : !user?.isGuest && !user?.isAdmin && (
            <>
            <Link href="/ratings" className={navItemClass} aria-label="Ratings">
              <Star className="w-4 h-4" />
              <span className={navLabelClass}>Ratings</span>
            </Link>
            <button
              onClick={() => setIsAccountOpen(true)}
              className={navItemClass}
              aria-label="Account"
            >
              <User className="w-4 h-4" />
              <span className={navLabelClass}>Account</span>
            </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className={navItemClass}
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
            <span className={navLabelClass}>Log out</span>
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