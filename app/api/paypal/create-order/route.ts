import { NextResponse } from "next/server";
import {
  cookieOptions,
  createCheckoutOrder,
  ORDER_COOKIE,
} from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const order = await createCheckoutOrder();
    const response = NextResponse.json({ approveUrl: order.approveUrl });
    response.cookies.set(ORDER_COOKIE, order.id, {
      ...cookieOptions(),
      maxAge: 60 * 60,
    });
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start checkout.";
    const status = message.includes("not configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
