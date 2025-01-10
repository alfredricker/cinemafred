'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Navigation } from './Navigation';
import { CreateUserDialog } from './CreateUserDialog';
import { UserPlus, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SortSelect } from './SortSelect';

export const Header = () => {
  const { user, logout } = useAuth();
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-gray-900 text-white py-4 px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold">CinemaFred</h1>
          <SortSelect />
        </div>
        
        <div className="flex items-center gap-4">
          {user?.isAdmin && (
            <button
              onClick={() => setIsCreateUserOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span className="text-sm">Create User</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
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