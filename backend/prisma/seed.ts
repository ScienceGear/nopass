/**
 * NovaBank seed — populates a registered account with realistic history.
 *
 * Register a real passkey through the app first, then run:
 *   npm run db:seed
 *
 * The seed is idempotent: it only writes history for users who have none yet,
 * so re-running is safe.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MERCHANTS: Array<{ name: string; category: string; amount: number; credit?: boolean }> = [
  { name: "Payroll — Prathamesh Ventures", category: "salary", amount: 120000, credit: true },
  { name: "Zomato", category: "food", amount: 845 },
  { name: "Rent — Lotus Residency", category: "utilities", amount: 18500 },
  { name: "Swiggy Instamart", category: "food", amount: 412 },
  { name: "Uber", category: "transport", amount: 236 },
  { name: "Jio Fiber", category: "utilities", amount: 1199 },
  { name: "Myntra", category: "shopping", amount: 2799 },
  { name: "Netflix", category: "subscription", amount: 649 },
  { name: "Spotify", category: "subscription", amount: 119 },
  { name: "Amazon", category: "shopping", amount: 1549 },
  { name: "Rohan's NRE Top-up", category: "transfer", amount: 25000 },
  { name: "BigBasket", category: "food", amount: 987 },
  { name: "Ola", category: "transport", amount: 184 },
  { name: "Electricity — MSEDCL", category: "utilities", amount: 2310 },
  { name: "BookMyShow", category: "food", amount: 640 },
  { name: "Fuel — HPCL", category: "transport", amount: 3200 },
  { name: "Referral bonus", category: "salary", amount: 5000, credit: true },
];

const CITIES = [
  ["Pune", "India"],
  ["Mumbai", "India"],
  ["Bengaluru", "India"],
  ["Pune", "India"],
] as const;

const DEVICES = [
  "MacBook Air · Chrome",
  "iPhone 15 Pro · Safari",
  "MacBook Air · Chrome",
  "iPad Air · Safari",
] as const;

async function main() {
  const users = await prisma.user.findMany({ include: { transactions: true } });
  if (users.length === 0) {
    console.log("No users yet — register a passkey through the app first, then re-run the seed.");
    return;
  }

  for (const user of users) {
    if (user.transactions.length > 0) {
      console.log(`skipped ${user.email} (already has ${user.transactions.length} transactions)`);
      continue;
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    for (let i = 0; i < MERCHANTS.length; i++) {
      const m = MERCHANTS[i % MERCHANTS.length];
      const daysAgo = Math.floor((i / MERCHANTS.length) * 55) + 1;
      await prisma.transaction.create({
        data: {
          userId: user.id,
          recipient: m.name,
          amount: m.credit ? m.amount : -m.amount,
          note: m.credit ? null : `${m.category} — ${new Date(now - daysAgo * day).toLocaleDateString("en-IN")}`,
          status: "completed",
          createdAt: new Date(now - daysAgo * day),
        },
      });
    }

    for (let i = 0; i < 6; i++) {
      const daysAgo = i * 9 + 2;
      const [city, country] = CITIES[i % CITIES.length];
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          eventType: "login",
          deviceInfo: DEVICES[i % DEVICES.length],
          ipAddress: `127.0.${i + 1}.${i + 2}`,
          location: `${city}, ${country}`,
          riskScore: i === 1 ? 68 : 8,
          riskAction: i === 1 ? "block" : "allow",
          details: i === 1 ? JSON.stringify({ signal: "New device from an unusual country" }) : JSON.stringify({ signal: "Known device, usual location" }),
          createdAt: new Date(now - daysAgo * day),
        },
      });
    }

    console.log(`seeded ${user.email}: ${MERCHANTS.length} transactions, 6 login events`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
