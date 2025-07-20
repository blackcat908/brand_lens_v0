import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { brandName, trustpilotUrl, brandId } = await request.json();

    if (!brandName || !trustpilotUrl || !brandId) {
      return NextResponse.json(
        { error: 'Missing required fields: brandName, trustpilotUrl, brandId' },
        { status: 400 }
      );
    }

    // Path to your scraper (adjust this path as needed)
    const scraperPath = path.join(process.cwd(), '..', '..', 'Desktop', 'scraper', 'Scraper_auto', 'trustpilot_scraper.py');
    
    // Check if scraper exists
    if (!fs.existsSync(scraperPath)) {
      return NextResponse.json(
        { error: 'Scraper not found. Please ensure the scraper is in the correct location.' },
        { status: 404 }
      );
    }

    // Execute the scraper
    const { stdout, stderr } = await execAsync(`python "${scraperPath}" "${trustpilotUrl}" "${brandName}"`);

    if (stderr) {
      console.error('Scraper stderr:', stderr);
    }

    // The scraper should save the data to a JSON file
    // We'll look for the output file in the public directory
    const outputFileName = `${brandId}.json`;
    const outputPath = path.join(process.cwd(), 'public', outputFileName);

    // Check if the output file was created
    if (!fs.existsSync(outputPath)) {
      return NextResponse.json(
        { error: 'Scraper completed but output file not found' },
        { status: 500 }
      );
    }

    // Read the scraped data
    const scrapedData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

    return NextResponse.json({
      success: true,
      message: `Successfully scraped ${scrapedData.length} reviews for ${brandName}`,
      data: scrapedData,
      brandId: brandId
    });

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape reviews', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Scraping API endpoint' });
} 