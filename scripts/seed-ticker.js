const { getFirebaseAdmin } = require('./lib/firebase-admin');

async function seedTicker() {
  try {
    const admin = await getFirebaseAdmin();
    const db = admin.database();
    const tickerRef = db.ref('ticker_events');

    const events = [
      {
        message: "User t***@gmail.com vừa thăng hạng lên Senior Dev!",
        type: "rank_up",
        timestamp: Date.now()
      },
      {
        message: "Mã nguồn SaaS CRM vừa đạt 500 lượt tải!",
        type: "milestone",
        timestamp: Date.now() - 5000
      },
      {
        message: "Hệ thống vừa thanh toán 2.500.000đ cho đối tác k***@yahoo.com",
        type: "commission",
        timestamp: Date.now() - 10000
      }
    ];

    for (const event of events) {
      await tickerRef.push(event);
    }

    console.log("✅ Seeded ticker events successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to seed ticker:", error);
    process.exit(1);
  }
}

seedTicker();
