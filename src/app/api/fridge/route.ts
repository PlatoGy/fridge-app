import { NextResponse, type NextRequest } from 'next/server';
import { getFridgeState, saveFridgeState } from '@/lib/server/fridge-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY_FRIDGE_STATE = {
  items: [],
  entries: [],
  recipes: [],
};

export async function GET() {
  try {
    const data = await getFridgeState();
    return NextResponse.json({
      exists: data !== null,
      data: data ?? EMPTY_FRIDGE_STATE,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load fridge data.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    await saveFridgeState(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save fridge data.' },
      { status: 500 },
    );
  }
}
