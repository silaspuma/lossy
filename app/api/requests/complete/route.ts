import { NextResponse } from "next/server";
import { completeRequest } from "@/lib/request-store";

export const runtime = "nodejs";

const ADMIN_PASSWORD = "67labubudubai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { requestId?: string; password?: string };

    if (!body.requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    if (body.password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const result = await completeRequest(body.requestId);
    return NextResponse.json({ completed: result.changed });
  } catch {
    return NextResponse.json({ error: "Failed to complete request" }, { status: 500 });
  }
}
