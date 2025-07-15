import re

def canonical_brand_id(brand_or_url):
    # If input looks like a Trustpilot URL, extract the domain after /review/
    match = re.search(r"trustpilot\.com/review/([\w\.-]+)", brand_or_url, re.IGNORECASE)
    if match:
        domain = match.group(1).lower()
        return re.sub(r'[^a-z0-9]', '', domain)
    # If input is already a domain or brand name, normalize it
    return ''.join(c for c in brand_or_url.lower() if c.isalnum()) 