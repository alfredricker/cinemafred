// test-db-connection.ts
import { PrismaClient } from '@prisma/client'

async function testConnection() {
  const prisma = new PrismaClient()
  
  try {
    // Test basic connection
    await prisma.$connect()
    console.log('✅ Database connection successful')

    // Test query execution
    const userCount = await prisma.user.count()
    console.log(`✅ Query executed successfully - Found ${userCount} users`)
    
    // Test movie table
    const movieCount = await prisma.movie.count()
    console.log(`✅ Movie table accessible - Found ${movieCount} movies`)
    
    // Test review table and relationships
    const reviewCount = await prisma.review.count()
    console.log(`✅ Review table accessible - Found ${reviewCount} reviews`)
    
    // Test a more complex query to verify joins work
    const userWithReviews = await prisma.user.findFirst({
      include: {
        reviews: {
          include: {
            movie: true
          }
        }
      }
    })
    console.log('✅ Complex query with relationships executed successfully')
    
    return true
  } catch (error) {
    console.error('❌ Database connection test failed:', error)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()
  .then(success => {
    if (success) {
      console.log('🎉 All database tests passed!')
      process.exit(0)
    } else {
      console.log('❌ Some database tests failed')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })