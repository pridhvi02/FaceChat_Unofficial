import { NextResponse } from 'next/server';

export async function POST(req) {
  const audioBlob = await req.blob();

  const backendResponse = await fetch('', {
    method: 'POST',
    body: audioBlob
  });

  const data = await backendResponse.json();

  return NextResponse.json(data);
}