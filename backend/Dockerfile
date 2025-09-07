# Use a full Python image (not slim) for easier dependency management
FROM python:3.11

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install essential system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libxss1 \
    fonts-liberation \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright browsers and system dependencies
RUN python -m playwright install chromium
RUN python -m playwright install-deps chromium

# Install NLTK data
RUN python -m nltk.downloader wordnet stopwords punkt

# Copy the rest of your code
COPY . .

# Expose the port (change if your app uses a different port)
EXPOSE 5000

# Run the app with Gunicorn (recommended for production)
# Use Railway's PORT environment variable
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:$PORT --timeout 300 --workers 1"] 