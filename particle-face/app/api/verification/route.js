import { NextResponse } from 'next/server';

export async function POST(req) {
  // Get the raw body data
  const formData = await req.formData();
  // Forward the data to your actual backend
  const backendResponse = await fetch('', {
    method: 'POST',
    body: formData
  });

  // Get the response from the backend
  const data = await backendResponse.json();

  // Return the response
  return NextResponse.json(data);
}