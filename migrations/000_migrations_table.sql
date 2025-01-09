-- migrations/000_migrations_table.sql
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- migrations/001_initial_schema.sql
BEGIN TRANSACTION;

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    date_created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    must_reset_password BOOLEAN DEFAULT false,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO migrations (name) VALUES ('001_initial_schema');

COMMIT;

-- migrations/002_add_movies.sql
BEGIN TRANSACTION;

-- Movies table
CREATE TABLE movies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    release_year INTEGER,
    r2_bucket_path TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO migrations (name) VALUES ('002_add_movies');

COMMIT;

-- migrations/003_add_reviews.sql
BEGIN TRANSACTION;

-- Reviews table
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    movie_id TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

-- Add indexes
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_movie_id ON reviews(movie_id);

-- Record this migration
INSERT INTO migrations (name) VALUES ('003_add_reviews');

COMMIT;

-- Example of a future migration: migrations/004_add_user_preferences.sql
BEGIN TRANSACTION;

-- Add new columns to users table
ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN notification_preferences JSON;

-- Record this migration
INSERT INTO migrations (name) VALUES ('004_add_user_preferences');

COMMIT;