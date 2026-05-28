-- CreateTable
CREATE TABLE "CachedSubtitle" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "os_file_id" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachedSubtitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CachedSubtitle_os_file_id_key" ON "CachedSubtitle"("os_file_id");

-- CreateIndex
CREATE INDEX "CachedSubtitle_movie_id_idx" ON "CachedSubtitle"("movie_id");

-- AddForeignKey
ALTER TABLE "CachedSubtitle" ADD CONSTRAINT "CachedSubtitle_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
