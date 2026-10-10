import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and the picture library.
    "/((?!_next/static|_next/image|favicon.ico|library/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)",
  ],
};
