export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand');
  const brandUrls: Record<string, string> = {
    'wander-doll': 'https://uk.trustpilot.com/review/www.wander-doll.com',
    'odd-muse': 'https://uk.trustpilot.com/review/oddmuse.co.uk',
    'because-of-alice': 'https://uk.trustpilot.com/review/www.becauseofalice.com',
    'bbxbrand': 'https://uk.trustpilot.com/review/bbxbrand.com',
    'murci': 'https://uk.trustpilot.com/review/murci.co.uk',
  };
  const url = brand && brandUrls[brand] ? brandUrls[brand] : `https://uk.trustpilot.com/review/www.${brand}.com`;
  return new Response(JSON.stringify({ sourceUrl: url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
} 