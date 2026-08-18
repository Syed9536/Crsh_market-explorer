import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function POST(req: Request) {
  if (!sql) {
    return NextResponse.json({ error: "Database not connected in Vercel settings." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { market_id, reported_winner, video_timestamp, evidence_url, reason } = body;

    if (!market_id || !reported_winner || !video_timestamp || !evidence_url || !reason) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown_ip";

    // 1. Data ko Neon Database me insert karna
    try {
      await sql`
        INSERT INTO market_disputes (market_id, reported_winner, video_timestamp, evidence_url, reason, user_ip)
        VALUES (${market_id}, ${reported_winner}, ${video_timestamp}, ${evidence_url}, ${reason}, ${ip})
      `;
    } catch (err: any) {
      if (err.message && err.message.includes('unique constraint')) {
        return NextResponse.json(
          { error: "You have already submitted a report for this market from this network." },
          { status: 400 }
        );
      }
      throw err; // Niche catch me jayega agar koi aur error hui
    }

    // 2. Count check karna (Clustering)
    const countResult = await sql`
      SELECT COUNT(*) as total 
      FROM market_disputes 
      WHERE market_id = ${market_id} 
      AND video_timestamp = ${video_timestamp}
      AND reported_winner = ${reported_winner}
    `;
    
    const reportCount = Number(countResult[0].total);

    // 3. Telegram Alert
    if (reportCount === 5) {
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const message = `🚨 *HIGH CONFIDENCE DISPUTE DETECTED*\n\n*Market ID:* #${market_id}\n*Community Claims Winner:* ${reported_winner}\n*Proof Timestamp:* ${video_timestamp}\n*Evidence Link:* ${evidence_url}\n*Reason:* ${reason}\n*Reports:* ${reportCount} users verified this.\n\nAdmins, please check the VOD and process refunds if valid!`;

        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          })
        });
      }
    }

    return NextResponse.json({ success: true, message: "Report submitted successfully!" });

  } catch (error: any) {
    console.error("Dispute API Error:", error);
    // Yeh ab actual database error UI pe dikhayega bajaye "Something went wrong" ke
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}