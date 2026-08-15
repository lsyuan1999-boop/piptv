import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";

/** Next 16 起用 proxy.ts 取代 middleware.ts，作用相同。 */
export default async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = token ? await verifySessionToken(token) : false;

  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 保护 /admin 及其子路由，但放过登录页本身
  matcher: ["/admin", "/admin/((?!login).*)"],
};
