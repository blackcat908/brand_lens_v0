import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { brandName, brandId } = await request.json();

    if (!brandName || !brandId) {
      return NextResponse.json(
        { error: 'Missing required fields: brandName, brandId' },
        { status: 400 }
      );
    }

    // Map frontend brand IDs to scraper brand names
    const brandMapping: { [key: string]: string } = {
      'wander-doll': 'wanderdoll',
      'murci': 'murci',
      'bbx-brand': 'bbxbrand',
      'because-of-alice': 'becauseofalice',
      'odd-muse': 'oddmuse'
    };

    const scraperBrandName = brandMapping[brandId] || brandName.toLowerCase();

    // Path to the single brand scraper
    const scraperPath = path.join(process.cwd(), 'Scraper_auto', 'scrape_single_brand.py');
    
    // Check if scraper exists
    if (!fs.existsSync(scraperPath)) {
      return NextResponse.json(
        { error: 'Scraper not found. Please ensure the scraper is in the correct location.' },
        { status: 404 }
      );
    }

    console.log(`Starting scrape for brand: ${scraperBrandName}`);

    // Execute the scraper for the specific brand
    const { stdout, stderr } = await execAsync(`python "${scraperPath}" --brand ${scraperBrandName}`);

    if (stderr) {
      console.error('Scraper stderr:', stderr);
    }

    console.log('Scraper stdout:', stdout);

    // Parse the number of new reviews from stdout
    let newReviews = 0;
    const match = stdout.match(/NEW_REVIEWS_ADDED:\s*(\d+)/);
    if (match) {
      newReviews = parseInt(match[1], 10);
    }

    // Check if the Flask API is running to get updated data
    if (scraperBrandName && typeof scraperBrandName === 'string' && scraperBrandName.trim() !== '') {
      try {
        const flaskResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/brands/${scraperBrandName}/analytics`);
        if (flaskResponse.ok) {
          const analytics = await flaskResponse.json();
          return NextResponse.json({
            success: true,
            message: `Successfully updated reviews for ${brandName}`,
            brandId: brandId,
            analytics: analytics,
            newReviews: newReviews
          });
        }
      } catch (flaskError) {
        console.warn('Flask API not available, returning basic success response');
      }
    }

    return NextResponse.json({
      success: true,
      message: `Scraping completed for ${brandName}`,
      brandId: brandId,
      newReviews: newReviews
    });

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape reviews', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

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