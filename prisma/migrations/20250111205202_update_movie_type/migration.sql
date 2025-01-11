/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Movie` table. All the data in the column will be lost.
  - You are about to drop the column `r2BucketPath` on the `Movie` table. All the data in the column will be lost.
  - You are about to drop the column `releaseYear` on the `Movie` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Movie` table. All the data in the column will be lost.
  - Added the required column `director` to the `Movie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `r2_image_path` to the `Movie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `r2_video_path` to the `Movie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Movie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Movie` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `Movie` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Movie" DROP COLUMN "createdAt",
DROP COLUMN "r2BucketPath",
DROP COLUMN "releaseYear",
DROP COLUMN "updatedAt",
ADD COLUMN     "cloudflare_video_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "director" TEXT NOT NULL,
ADD COLUMN     "genre" TEXT[],
ADD COLUMN     "r2_image_path" TEXT NOT NULL,
ADD COLUMN     "r2_subtitles_path" TEXT,
ADD COLUMN     "r2_video_path" TEXT NOT NULL,
ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "streaming_url" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "year" INTEGER NOT NULL,
ALTER COLUMN "description" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Movie_title_idx" ON "Movie"("title");
