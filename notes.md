# PROJECT STRUCTURE
src/
├── app/                  
│   ├── admin/
│   │   ├── users/
│   │       └── page.tsx        # Admin dashboard for user management
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── route.ts    # Login endpoint handler
│   │   │   └── validate/
│   │   │       └── route.ts    # Token validation endpoint
│   │   └── users/
│   │       └── route.ts        # User CRUD operations API
│   ├── login/
│   │   └── page.tsx            # Login page component
│   ├── movie/
│   │   └── [id]
│   │       └──page.tsx         # Dynamic movie detail page
│   └── reset-password/   
│       └── page.tsx            # Password reset form page
│
├── components/          
│   ├── Header.tsx             # Site-wide header component
│   ├── MovieCard.tsx          # Individual movie display card
│   ├── MovieGrid.tsx          # Grid layout for multiple movies
│   ├── Navigation.tsx         # Site navigation menu
│   ├── RatingStars.tsx        # Star rating display/input
│   └── SortSelect.tsx         # Movie sorting dropdown
├── context/              
│   └── AuthContext.tsx         # Global auth state management
├── data/
│   └── movie.ts               # Movie data types/constants
├── hooks
│   └── useMovie.ts            # Custom hook for movie data fetching
├── lib/                 
│   ├── auth.ts                # Authentication utility functions
│   ├── db.ts                  # Database connection/queries
│   └── jwt.ts                 # JWT handling utilities
└── types/             
    ├── auth.ts                # Auth-related type definitions
    ├── user.ts                # User-related type definitions
    ├── db.ts                  # Database type definitions
    └── movie.ts               # Movie-related type definitions


migrations/
└── 000_initial_schema.sql


scripts/
├── create-admin.ts
├── migrate.ts
└── update-admin-password.ts