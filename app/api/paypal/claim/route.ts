import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieOptions, DOWNLOAD_ONCE_COOKIE } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const allowed = jar.get(DOWNLOAD_ONCE_COOKIE)?.value === "1";
  const response = NextResponse.json(
    { download: allowed },
    { headers: { "Cache-Control": "no-store" } },
  );
  if (allowed) {
    response.cookies.set(DOWNLOAD_ONCE_COOKIE, "", {
      ...cookieOptions(),
      maxAge: 0,
    });
  }
  return response;
}
