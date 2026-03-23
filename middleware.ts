import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/music/")) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = `/api/music/${request.nextUrl.pathname.replace(/^\/music\//, "")}`;
    return NextResponse.rewrite(nextUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/music/:path*"]
};
