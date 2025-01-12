'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CreateUserDialog } from './CreateUserDialog';
import { UserPlus, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SortSelect } from './SortSelect';
import Link from 'next/link';  // Add this import

export const Header = () => {
  const { user, logout } = useAuth();
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
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
    <header className="py-4 px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link 
            href="/" 
            className="text-xl font-bold hover:text-blue-400 transition-colors"
          >
            CinemaFred
          </Link>
          <SortSelect />
        </div>
        
        {/* Rest of the header component remains the same */}
        <div className="flex items-center gap-4">
          {user?.isAdmin && (
            <button
              onClick={() => setIsCreateUserOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/30 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span className="text-sm">Create User</span>
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

        <CreateUserDialog 
          isOpen={isCreateUserOpen} 
          onClose={() => setIsCreateUserOpen(false)} 
        />
      </div>
    </header>
  );
};