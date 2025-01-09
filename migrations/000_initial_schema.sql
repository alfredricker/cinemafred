-- migrations/000_initial_schema.sql

PRAGMA foreign_keys = ON;

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

-- Movies table (for storing movie metadata)
CREATE TABLE movies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    release_year INTEGER,
    r2_bucket_path TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_movie_id ON reviews(movie_id);

-- Create trigger to update the updated_at timestamp
CREATE TRIGGER users_update_timestamp 
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER movies_update_timestamp
AFTER UPDATE ON movies
BEGIN
    UPDATE movies SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER reviews_update_timestamp
AFTER UPDATE ON reviews
BEGIN
    UPDATE reviews SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;