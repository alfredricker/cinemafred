// scripts/check-db.ts
import { PrismaClient } from '@prisma/client'

async function checkDatabases() {
  // Create two Prisma clients with different connection strings
  const devPrisma = new PrismaClient({
    datasourceUrl: process.env.DEV_DATABASE_URL
  })
  
  const prodPrisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
  })

  try {
    // Fetch users from both databases
    const devUsers = await devPrisma.user.findMany({
      select: {
        email: true,
        username: true,
        isActive: true,
        isAdmin: true
      },
      orderBy: { email: 'asc' }
    })

    const prodUsers = await prodPrisma.user.findMany({
      select: {
        email: true,
        username: true,
        isActive: true,
        isAdmin: true
      },
      orderBy: { email: 'asc' }
    })

    console.log('Development Database Users:', devUsers)
    console.log('Production Database Users:', prodUsers)

    // Compare user counts
    console.log(`Dev users: ${devUsers.length}`)
    console.log(`Prod users: ${prodUsers.length}`)

    // Find missing users in prod
    const missingInProd = devUsers.filter(devUser => 
      !prodUsers.some(prodUser => prodUser.email === devUser.email)
    )

    if (missingInProd.length > 0) {
      console.log('Users missing in production:', missingInProd)
    }

  } catch (error) {
    console.error('Error comparing databases:', error)
  } finally {
    await devPrisma.$disconnect()
    await prodPrisma.$disconnect()
  }
}

checkDatabases()