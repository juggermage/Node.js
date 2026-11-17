require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const rooms = [
  ...Array.from({ length: 12 }, (_, index) => ({ name: `Групова кімната ${String(index + 1).padStart(2, '0')}`, purpose: 'GROUP_BASE', capacity: 20 })),
  { name: 'Математика та логіка', purpose: 'SPECIALIST_MATH_LOGIC', capacity: 20 },
  { name: 'Мовленнєвий розвиток та англійська', purpose: 'SPECIALIST_LANGUAGE', capacity: 20 },
  { name: 'Пізнання світу та природи', purpose: 'SPECIALIST_WORLD_DISCOVERY', capacity: 20 },
  { name: 'Мистецтво та творчість', purpose: 'SPECIALIST_ARTS', capacity: 20 },
  { name: 'Музична зала', purpose: 'SPECIALIST_MUSIC', capacity: 20 },
  { name: 'Танцювальна зала', purpose: 'SPECIALIST_DANCE', capacity: 20 },
  { name: 'Спортивна зала', purpose: 'SPECIALIST_SPORTS', capacity: 20 },
  { name: 'Конструювання та робототехніка', purpose: 'SPECIALIST_ROBOTICS', capacity: 20 }
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  for (const room of rooms) {
    await prisma.room.upsert({ where: { name: room.name }, update: { purpose: room.purpose, capacity: room.capacity }, create: room });
  }
  console.log(`Facility rooms synchronized: ${rooms.length} (12 group + 8 specialist)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
