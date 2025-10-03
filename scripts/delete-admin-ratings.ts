import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAdminRatings() {
  try {
    console.log('🔍 Finding admin users...');
    
    // Get all admin users
    const admins = await prisma.user.findMany({
      where: {
        isAdmin: true
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    if (admins.length === 0) {
      console.log('✅ No admin users found.');
      return;
    }

    console.log(`📋 Found ${admins.length} admin user(s):`);
    admins.forEach(admin => {
      console.log(`   - ${admin.username} (${admin.email})`);
    });

    const adminIds = admins.map(admin => admin.id);

    // Count ratings before deletion
    const ratingCount = await prisma.rating.count({
      where: {
        user_id: {
          in: adminIds
        }
      }
    });

    const reviewCount = await prisma.review.count({
      where: {
        user_id: {
          in: adminIds
        }
      }
    });

    console.log(`\n📊 Found ${ratingCount} rating(s) and ${reviewCount} review(s) from admin users.`);

    if (ratingCount === 0 && reviewCount === 0) {
      console.log('✅ No admin ratings or reviews to delete.');
      return;
    }

    console.log('\n🗑️  Deleting admin ratings and reviews...');

    // Delete ratings and reviews (not in transaction to avoid timeout)
    const deletedRatings = await prisma.rating.deleteMany({
      where: {
        user_id: {
          in: adminIds
        }
      }
    });

    const deletedReviews = await prisma.review.deleteMany({
      where: {
        user_id: {
          in: adminIds
        }
      }
    });

    console.log(`\n✅ Deleted ${deletedRatings.count} rating(s) and ${deletedReviews.count} review(s)`);

    // Get movies that had admin ratings to recalculate
    console.log('\n🔄 Recalculating average ratings...');
    
    const movies = await prisma.movie.findMany({
      select: { id: true }
    });

    console.log(`   Processing ${movies.length} movies...`);

    // Process in batches to avoid overwhelming the database
    const batchSize = 50;
    let processed = 0;

    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (movie) => {
          const { _avg } = await prisma.rating.aggregate({
            where: { movie_id: movie.id },
            _avg: { value: true }
          });

          await prisma.movie.update({
            where: { id: movie.id },
            data: { averageRating: _avg.value || 0 }
          });
        })
      );

      processed += batch.length;
      if (processed % 100 === 0 || processed === movies.length) {
        console.log(`   Processed ${processed}/${movies.length} movies...`);
      }
    }

    const result = {
      deletedRatings: deletedRatings.count,
      deletedReviews: deletedReviews.count
    };

    console.log('\n✅ Successfully deleted:');
    console.log(`   - ${result.deletedRatings} rating(s)`);
    console.log(`   - ${result.deletedReviews} review(s)`);
    console.log('✅ Average ratings recalculated for all movies.');

  } catch (error) {
    console.error('❌ Error deleting admin ratings:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
deleteAdminRatings()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

