'use client';
import { useState, useEffect, Suspense } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { redirect, useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ChevronDown, ChevronUp, Plus, X, Search } from 'lucide-react';
import { RatingStars } from '@/components/movies/RatingStars';

interface MovieRating {
  id: string;
  title: string;
  year: number;
  averageRating: number | null;
  ratings: Array<{
    value: number;
    user_id: string;
    user: {
      id: string;
      username: string;
    };
  }>;
}

interface User {
  id: string;
  username: string;
}

type SortColumn = 'title' | 'average' | string; // string for user IDs
type SortDirection = 'asc' | 'desc';

function RatingsContent() {
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [movies, setMovies] = useState<MovieRating[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Initialize state from URL params
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    const usersParam = searchParams.get('users');
    return usersParam ? usersParam.split(',') : [];
  });
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>(searchParams.get('sortBy') || 'title');
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    (searchParams.get('sortDir') as SortDirection) || 'asc'
  );
  
  // Add user state
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      redirect('/login');
    }
  }, [user, authLoading]);

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Update URL when state changes (but not on initial load)
  useEffect(() => {
    if (!isInitialized) return;

    const params = new URLSearchParams();
    
    if (selectedUserIds.length > 0) {
      params.set('users', selectedUserIds.join(','));
    }
    
    if (sortColumn !== 'title') {
      params.set('sortBy', sortColumn);
    }
    
    if (sortDirection !== 'asc') {
      params.set('sortDir', sortDirection);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `/ratings?${queryString}` : '/ratings';
    
    // Only update if URL actually changed
    if (window.location.pathname + window.location.search !== newUrl) {
      router.push(newUrl, { scroll: false });
    }
  }, [selectedUserIds, sortColumn, sortDirection, isInitialized, router]);

  useEffect(() => {
    if (user) {
      fetchRatings();
    }
  }, [user, selectedUserIds]);

  const fetchRatings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ userIds: selectedUserIds }),
      });

      if (!response.ok) throw new Error('Failed to fetch ratings');

      const data = await response.json();
      setMovies(data.movies);
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
    } catch (err) {
      setError('Error loading ratings. Please try again.');
      console.error('Error fetching ratings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to search users');

      const data = await response.json();
      // Filter out users already in the view
      const filteredResults = data.users.filter(
        (u: User) => !users.some(existing => existing.id === u.id)
      );
      setSearchResults(filteredResults);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const addUser = (userId: string) => {
    if (!selectedUserIds.includes(userId)) {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowUserSearch(false);
  };

  const removeUser = (userId: string) => {
    setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to desc for ratings, asc for title
      setSortColumn(column);
      setSortDirection(column === 'title' ? 'asc' : 'desc');
    }
  };

  const getSortedMovies = () => {
    const sorted = [...movies];

    sorted.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortColumn === 'title') {
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
      } else if (sortColumn === 'average') {
        aValue = a.averageRating || 0;
        bValue = b.averageRating || 0;
      } else {
        // User column
        const aRating = a.ratings.find(r => r.user_id === sortColumn);
        const bRating = b.ratings.find(r => r.user_id === sortColumn);
        aValue = aRating?.value || 0;
        bValue = bRating?.value || 0;
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return sorted;
  };

  const getRatingForUser = (movie: MovieRating, userId: string): number | null => {
    const rating = movie.ratings.find(r => r.user_id === userId);
    return rating ? rating.value : null;
  };

  const calculateAverageForMovie = (movie: MovieRating): number | null => {
    const userRatings = users
      .map(u => getRatingForUser(movie, u.id))
      .filter(r => r !== null) as number[];
    
    if (userRatings.length === 0) return null;
    
    const sum = userRatings.reduce((acc, val) => acc + val, 0);
    return sum / userRatings.length;
  };

  const handleRatingChange = (movieId: string, userId: string, newRating: number) => {
    // Update the rating locally without refetching
    setMovies(prevMovies => 
      prevMovies.map(movie => {
        if (movie.id !== movieId) return movie;
        
        // Update or add the rating for this user
        const existingRatingIndex = movie.ratings.findIndex(r => r.user_id === userId);
        let updatedRatings = [...movie.ratings];
        
        if (newRating === 0) {
          // Remove the rating if it was cleared
          updatedRatings = updatedRatings.filter(r => r.user_id !== userId);
        } else if (existingRatingIndex >= 0) {
          // Update existing rating
          updatedRatings[existingRatingIndex] = {
            ...updatedRatings[existingRatingIndex],
            value: newRating
          };
        } else {
          // Add new rating
          const user = users.find(u => u.id === userId);
          if (user) {
            updatedRatings.push({
              value: newRating,
              user_id: userId,
              user: {
                id: userId,
                username: user.username
              }
            });
          }
        }
        
        // Recalculate average rating for display
        const userRatingsForAvg = users
          .map(u => {
            const rating = updatedRatings.find(r => r.user_id === u.id);
            return rating ? rating.value : null;
          })
          .filter(r => r !== null) as number[];
        
        const newAverageRating = userRatingsForAvg.length > 0
          ? userRatingsForAvg.reduce((acc, val) => acc + val, 0) / userRatingsForAvg.length
          : null;
        
        return {
          ...movie,
          ratings: updatedRatings,
          averageRating: newAverageRating
        };
      })
    );
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) return null;

  const sortedMovies = getSortedMovies();
  const displayUsers = users.sort((a, b) => {
    // Current user first
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return a.username.localeCompare(b.username);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <Header />
      
      <main className="px-8 py-8 max-w-[120rem] mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Ratings</h1>
          
          <div className="relative">
            <button
              onClick={() => setShowUserSearch(!showUserSearch)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>

            {showUserSearch && (
              <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10">
                <div className="p-3 border-b border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>
                
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {isSearching ? (
                    <div className="p-4 text-center text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((searchUser) => (
                      <button
                        key={searchUser.id}
                        onClick={() => addUser(searchUser.id)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors text-white text-sm"
                      >
                        {searchUser.username}
                      </button>
                    ))
                  ) : searchQuery.length >= 2 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">
                      No users found
                    </div>
                  ) : (
                    <div className="p-4 text-center text-gray-400 text-sm">
                      Type at least 2 characters to search
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="text-center py-12">
            <div className="text-red-500 mb-4">{error}</div>
            <button
              onClick={fetchRatings}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900 border-b border-gray-700">
                  <tr>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-white cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => handleSort('title')}
                    >
                      <div className="flex items-center gap-2">
                        Movie
                        {sortColumn === 'title' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    
                    {displayUsers.map((u) => (
                      <th 
                        key={u.id}
                        className="px-6 py-4 text-left text-sm font-semibold text-white cursor-pointer hover:bg-gray-800 transition-colors group"
                        onClick={() => handleSort(u.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {u.username}
                            {u.id === currentUserId && (
                              <span className="text-xs text-blue-400">(You)</span>
                            )}
                            {sortColumn === u.id && (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                          {u.id !== currentUserId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeUser(u.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-all"
                              title="Remove user"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-white cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => handleSort('average')}
                    >
                      <div className="flex items-center gap-2">
                        Average
                        {sortColumn === 'average' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMovies.map((movie, index) => (
                    <tr 
                      key={movie.id}
                      className={`border-b border-gray-700 hover:bg-gray-750 transition-colors ${
                        index % 2 === 0 ? 'bg-gray-800/50' : 'bg-gray-800/30'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-white font-medium">{movie.title}</div>
                          <div className="text-gray-400 text-sm">{movie.year}</div>
                        </div>
                      </td>
                      
                      {displayUsers.map((u) => (
                        <td key={u.id} className="px-6 py-4">
                          <RatingStars
                            movieId={movie.id}
                            initialRating={getRatingForUser(movie, u.id) || 0}
                            isEditable={u.id === currentUserId}
                            size="inline"
                            onRatingChange={(newRating) => handleRatingChange(movie.id, u.id, newRating || 0)}
                          />
                        </td>
                      ))}
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 10 }).map((_, i) => {
                              const avg = calculateAverageForMovie(movie) || 0;
                              const isFilled = avg >= i + 1;
                              const isHalfFilled = avg >= i + 0.5 && avg < i + 1;
                              
                              return (
                                <div key={i} className="w-4 h-4 flex items-center justify-center">
                                  <div className={`w-3 h-3 ${
                                    isFilled ? 'bg-yellow-400' : isHalfFilled ? 'bg-yellow-400/50' : 'bg-gray-600'
                                  } rounded-sm`} />
                                </div>
                              );
                            })}
                          </div>
                          {calculateAverageForMovie(movie) !== null && (
                            <span className="text-xs text-gray-400 font-medium">
                              {calculateAverageForMovie(movie)?.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {sortedMovies.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No movies found
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function RatingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <RatingsContent />
    </Suspense>
  );
}

