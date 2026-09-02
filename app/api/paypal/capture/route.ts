import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  appBaseUrl,
  captureCheckoutOrder,
  cookieOptions,
  DOWNLOAD_ONCE_COOKIE,
  ORDER_COOKIE,
} from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = appBaseUrl();
  const token = new URL(request.url).searchParams.get("token");
  const jar = await cookies();
  const expected = jar.get(ORDER_COOKIE)?.value;

  if (!token || !expected || token !== expected) {
    return NextResponse.redirect(new URL("/?canceled=1", base));
  }

  try {
    await captureCheckoutOrder(token);
    const response = NextResponse.redirect(new URL("/?paid=1", base));
    response.cookies.set(ORDER_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    response.cookies.set("download_paid", "", { ...cookieOptions(), maxAge: 0 });
    response.cookies.set(DOWNLOAD_ONCE_COOKIE, "1", {
      ...cookieOptions(),
      maxAge: 120,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?canceled=1", base));
  }
}
