'use client';
import { LogOut } from 'lucide-react';
import { SortSelect } from './SortSelect';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export const Header: React.FC = () => {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };
  return (
    <header className="bg-black/20 text-white py-4 px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <SortSelect />
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Log out</span>
        </button>
      </div>
    </header>
  );
};