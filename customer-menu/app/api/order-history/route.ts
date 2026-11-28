export async function GET(request: Request) {
  const receipts = (request.headers.get('x-order-receipts') || '').split(',').slice(-50)
    .filter(key => /^[a-f0-9-]{36}$/i.test(key));
  if (!receipts.length) return Response.json({ data: [] });
  const url = new URL('/public/orders', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
  url.searchParams.set('rid', process.env.NEXT_PUBLIC_RESTAURANT_ID || '00000000-0000-0000-0000-000000000001');
  const table = new URL(request.url).searchParams.get('table_id');
  if (table) url.searchParams.set('table_id', table);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { 'x-order-receipts': receipts.join(',') }, signal: AbortSignal.timeout(8000) });
      if (res.ok) return Response.json(await res.json(), { headers: { 'Cache-Control': 'private, no-store' } });
      if (res.status < 500) return Response.json({error:'Order history unavailable'}, { status: res.status });
    } catch { /* Retry a transient upstream failure once. */ }
  }
  return Response.json({error:'Order history temporarily unavailable'}, {status:503});
}
