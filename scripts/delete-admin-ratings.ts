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

    // Delete in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete all ratings from admin users
      const deletedRatings = await tx.rating.deleteMany({
        where: {
          user_id: {
            in: adminIds
          }
        }
      });

      // Delete all reviews from admin users
      const deletedReviews = await tx.review.deleteMany({
        where: {
          user_id: {
            in: adminIds
          }
        }
      });

      // Recalculate average ratings for all movies
      const movies = await tx.movie.findMany({
        select: { id: true }
      });

      console.log(`\n🔄 Recalculating average ratings for ${movies.length} movies...`);

      for (const movie of movies) {
        const { _avg } = await tx.rating.aggregate({
          where: { movie_id: movie.id },
          _avg: { value: true }
        });

        await tx.movie.update({
          where: { id: movie.id },
          data: { averageRating: _avg.value || 0 }
        });
      }

      return {
        deletedRatings: deletedRatings.count,
        deletedReviews: deletedReviews.count
      };
    });

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

