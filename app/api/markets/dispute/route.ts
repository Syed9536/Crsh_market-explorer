
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// Neon Database Connection
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function POST(req: Request) {
  if (!sql) {
    return NextResponse.json({ error: "Database not connected" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { market_id, reported_winner, video_timestamp } = body;

    // Vercel se user ka IP nikalna (Spam rokne ke liye)
    const ip = req.headers.get("x-forwarded-for") || "unknown_ip";

    // 1. Data ko Neon Database me insert karna
    try {
      await sql`
        INSERT INTO market_disputes (market_id, reported_winner, video_timestamp, user_ip)
        VALUES (${market_id}, ${reported_winner}, ${video_timestamp}, ${ip})
      `;
    } catch (err: any) {
      // Agar unique constraint (ek IP se doosri baar vote) fail ho jaye
      if (err.message && err.message.includes('unique constraint')) {
        return NextResponse.json(
          { error: "Aapne already is market par report submit kar di hai." },
          { status: 400 }
        );
      }
      throw err;
    }

    // 2. Count check karna: Kitne logon ne exact yahi time aur winner report kiya hai?
    const countResult = await sql`
      SELECT COUNT(*) as total 
      FROM market_disputes 
      WHERE market_id = ${market_id} 
      AND video_timestamp = ${video_timestamp}
      AND reported_winner = ${reported_winner}
    `;
    
    const reportCount = Number(countResult[0].total);

    // 3. Telegram Alert (Threshold = 5 reports)
    // Hum "===" 5 check kar rahe hain taaki spam na ho (sirf ek baar alert jaye)
    if (reportCount === 5) {
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const message = `🚨 *HIGH CONFIDENCE DISPUTE DETECTED*\n\n*Market ID:* #${market_id}\n*Community Claims Winner:* ${reported_winner}\n*Proof Timestamp:* ${video_timestamp}\n*Reports:* ${reportCount} users reported this exact time.\n\nAdmins, please verify this VOD!`;

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

  } catch (error) {
    console.error("Dispute API Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}