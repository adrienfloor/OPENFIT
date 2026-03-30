import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/**
 * Thin proxy to the Fastify API for cookie-based token refresh.
 * The browser sends the HttpOnly refresh token cookie; this route
 * forwards it to the API and returns the new access token.
 * Running server-side keeps the refresh token flow off the client bundle.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    const res = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${API_URL}/auth/refresh`,
      {},
      {
        headers: {
          cookie: cookieHeader,
        },
      },
    );

    const response = NextResponse.json({ accessToken: res.data.accessToken });

    // Forward the Set-Cookie header from the API to propagate the rotated refresh token
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      for (const cookie of setCookie) {
        response.headers.append('Set-Cookie', cookie);
      }
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
  }
}
