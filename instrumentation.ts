export async function register() {
  // Lokal ortamda setInterval ile cron calistir
  // Vercel'de bu calismaz, onun yerine vercel.json'daki cron job kullanilir
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startCron } = await import("./lib/cron");
    const port = process.env.PORT || 3000;
    startCron(`http://localhost:${port}`);
  }
}
