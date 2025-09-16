-- AlterTable
ALTER TABLE "Movie" ADD COLUMN     "hls_ready" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "r2_hls_path" TEXT;

-- CreateIndex
CREATE INDEX "Movie_hls_ready_idx" ON "Movie"("hls_ready");
