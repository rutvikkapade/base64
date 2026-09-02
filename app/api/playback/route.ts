import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const secret = process.env.PLAYBACK_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "PLAYBACK_SECRET is not configured." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { secret },
    { headers: { "Cache-Control": "no-store" } },
  );
}
