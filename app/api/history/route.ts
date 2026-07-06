import { NextResponse } from 'next/server'
import { readHistory } from '@/lib/history'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ entries: await readHistory() })
}
