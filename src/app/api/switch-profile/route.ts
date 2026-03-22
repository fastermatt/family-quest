import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { profileId } = await req.json()

  const response = NextResponse.json({ success: true })

  if (profileId) {
    // Set cookie to impersonate a child profile
    response.cookies.set('active_profile_id', profileId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
    })
  } else {
    // Clear the cookie to return to parent view
    response.cookies.delete('active_profile_id')
  }

  return response
}
