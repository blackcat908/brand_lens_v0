# Use the official Python image
FROM python:3.11-slim

# Install system dependencies for Playwright/Chromium
RUN apt-get update && \
    apt-get install -y wget gnupg2 libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 libasound2 libgbm1 libxshmfence1 libxcomposite1 libxdamage1 libxrandr2 libu2f-udev libvulkan1 fonts-liberation libappindicator3-1 xdg-utils && \
    rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright and browsers
RUN pip install playwright && playwright install chromium

# Copy backend code
COPY . .

# Expose the port (Railway uses $PORT env variable)
EXPOSE 8080

# Start the app
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8080"] 