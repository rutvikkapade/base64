import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PAID_COOKIE } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const paid = jar.get(PAID_COOKIE)?.value === "1";
  return NextResponse.json(
    { paid },
    { headers: { "Cache-Control": "no-store" } },
  );
}
