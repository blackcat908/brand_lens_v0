# Use a full Python image (not slim) for easier dependency management
FROM python:3.11

# Install system dependencies for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libxss1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcups2 \
    libdrm2 \
    libx11-xcb1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxtst6 \
    libxrender1 \
    libatk1.0-0 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libdbus-1-3 \
    libexpat1 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN python -m playwright install chromium

# Install NLTK data
RUN python -m nltk.downloader wordnet stopwords punkt

# Copy the rest of your code
COPY . .

# Expose the port (change if your app uses a different port)
EXPOSE 5000

# Run the app with Gunicorn (recommended for production)
# Increased timeout to handle long-running scraping operations
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--timeout", "300", "--workers", "1"] 