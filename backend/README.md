# Trustpilot Review Scraper

A Python script that uses Playwright to scrape reviews from Trustpilot. The script extracts review text, star ratings, reviewer names, and review dates, then saves them to a CSV file.

## Features

- Scrapes reviews from Trustpilot using Playwright
- Extracts review text, star ratings, reviewer names, and dates
- Saves results to CSV format
- Uses headless browser for efficient scraping
- Includes error handling and rate limiting
- Supports custom brand names and page limits

## Installation

1. **Clone or download this repository**

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Playwright browsers:**
   ```bash
   playwright install
   ```

## Usage

### Basic Usage
```bash
python trustpilot_scraper.py <brand_name>
```

### With Custom Page Limit
```bash
python trustpilot_scraper.py <brand_name> <max_pages>
```

### Examples
```bash
# Scrape 5 pages (default) for wander-doll
python trustpilot_scraper.py wander-doll

# Scrape 10 pages for amazon
python trustpilot_scraper.py amazon 10

# Scrape 3 pages for microsoft
python trustpilot_scraper.py microsoft 3
```

## Output

The script creates a CSV file named `{brand_name}_reviews.csv` containing:
- `review_text`: The actual review content
- `star_rating`: Rating from 1-5 stars
- `reviewer_name`: Name of the reviewer (if available)
- `review_date`: Date of the review

## URL Structure

The scraper works with Trustpilot URLs in this format:
```
https://www.trustpilot.com/review/www.{brand_name}.com?page={page_number}
```

## Error Handling

- The script skips pages that fail to load
- Individual review extraction errors are logged but don't stop the process
- Graceful handling of missing data (empty reviewer names, missing dates, etc.)

## Rate Limiting

- 2-second delay between page requests to be respectful to Trustpilot's servers
- Uses realistic user agent headers to avoid detection

## Requirements

- Python 3.7+
- Playwright
- Pandas

## Notes

- The script uses headless browser mode by default
- Make sure you comply with Trustpilot's terms of service and robots.txt
- Consider the legal and ethical implications of web scraping
- The script is for educational purposes only

## Troubleshooting

If you encounter issues:

1. **Browser installation problems:**
   ```bash
   playwright install --force
   ```

2. **Selector issues:** Trustpilot may update their HTML structure. Check the selectors in the script if scraping fails.

3. **Rate limiting:** If you get blocked, try increasing the delay between requests or using a proxy.

## License

This project is for educational purposes only. Please respect website terms of service and robots.txt files. 