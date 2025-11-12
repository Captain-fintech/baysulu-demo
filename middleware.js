 // middleware.js (корень репозитория)
import { NextResponse } from 'next/server';

export const config = {
  matcher: '/:path*', // перехватываем все пути
};

export function middleware(req) {
  const { pathname, search, hash } = req.nextUrl;
  const dst = 'https://baysulu-onefile-rtdl.vercel.app' + pathname + search + hash;
  return NextResponse.redirect(dst, 308);
}
