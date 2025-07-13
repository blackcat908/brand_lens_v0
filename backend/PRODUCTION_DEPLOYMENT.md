# Production Deployment Guide

## Overview
This guide explains how to deploy the Trustpilot scraper in production environments instead of running manual commands.

## Production Deployment Options

### Option 1: Scheduled Script (Recommended for Small Scale)

#### Windows Task Scheduler
1. **Create a batch file** (`run_scraper.bat`):
```batch
@echo off
cd /d "C:\path\to\your\scraper"
python production_scraper.py
```

2. **Setup Task Scheduler**:
   - Open Task Scheduler
   - Create Basic Task
   - Set trigger (e.g., daily at 2 AM)
   - Action: Start a program
   - Program: `C:\path\to\run_scraper.bat`

#### Linux/Mac Cron Job
```bash
# Edit crontab
crontab -e

# Add this line to run daily at 2 AM
0 2 * * * cd /path/to/scraper && python production_scraper.py >> /path/to/scraper/logs/cron.log 2>&1
```

### Option 2: Docker Container (Recommended for Medium Scale)

#### Create Dockerfile
```dockerfile
FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium

COPY . .
CMD ["python", "production_scraper.py"]
```

#### Run with Docker
```bash
# Build image
docker build -t trustpilot-scraper .

# Run container
docker run -v $(pwd)/data:/app/data -v $(pwd)/logs:/app/logs trustpilot-scraper
```

### Option 3: Cloud Services (Recommended for Large Scale)

#### AWS Lambda + EventBridge
1. **Package as Lambda function**
2. **Set up EventBridge rule** for scheduling
3. **Use RDS/PostgreSQL** instead of SQLite

#### Google Cloud Functions + Cloud Scheduler
1. **Deploy as Cloud Function**
2. **Set up Cloud Scheduler** for triggers
3. **Use Cloud SQL** for database

#### Azure Functions + Timer Trigger
1. **Deploy as Azure Function**
2. **Configure timer trigger**
3. **Use Azure SQL Database**

## Database Options for Production

### Current: SQLite (Development)
- ✅ Simple, no setup required
- ❌ Not suitable for concurrent access
- ❌ No backup/recovery features

### Production: PostgreSQL/MySQL
```python
# Update database.py
DATABASE_URL = "postgresql://user:password@localhost/trustpilot_reviews"
```

### Cloud Databases
- **AWS RDS**: Managed PostgreSQL/MySQL
- **Google Cloud SQL**: Managed database service
- **Azure Database**: Managed SQL database

## Monitoring and Alerting

### Log Monitoring
```python
# Add to production_scraper.py
import smtplib
from email.mime.text import MIMEText

def send_alert(subject, message):
    """Send email alert on failure"""
    # Configure email settings
    pass
```

### Health Checks
```python
def health_check():
    """Check if scraper is working properly"""
    stats = get_scraping_stats()
    if stats['total_reviews'] == 0:
        send_alert("Scraper Alert", "No reviews found in database")
```

## Configuration Management

### Environment Variables
```bash
# .env file
DATABASE_URL=postgresql://user:pass@localhost/db
LOG_LEVEL=INFO
MAX_PAGES=3
```

### Configuration Files
- Use `config.py` for different environments
- Separate configs for dev/staging/production

## Security Considerations

### API Keys and Secrets
- Store secrets in environment variables
- Use AWS Secrets Manager or similar
- Never commit secrets to version control

### Rate Limiting
- Respect Trustpilot's robots.txt
- Add delays between requests
- Monitor for IP blocking

## Backup and Recovery

### Database Backups
```bash
# PostgreSQL backup
pg_dump trustpilot_reviews > backup.sql

# Automated backup script
0 1 * * * pg_dump trustpilot_reviews | gzip > /backups/backup_$(date +\%Y\%m\%d).sql.gz
```

### Data Retention
- Keep logs for 30 days
- Archive old reviews to cold storage
- Implement data cleanup policies

## Scaling Considerations

### Horizontal Scaling
- Run multiple scraper instances
- Use load balancer for distribution
- Implement distributed locking

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Use connection pooling

## Troubleshooting

### Common Issues
1. **Browser crashes**: Implement retry logic
2. **Network timeouts**: Increase timeout values
3. **Database locks**: Use connection pooling
4. **Memory leaks**: Monitor resource usage

### Debug Mode
```python
# Enable debug logging
LOGGING_CONFIG['level'] = 'DEBUG'
SCRAPING_CONFIG['headless'] = False  # Show browser
```

## Performance Optimization

### Database Optimization
- Add indexes on frequently queried columns
- Use database connection pooling
- Implement query optimization

### Scraping Optimization
- Use async/await for concurrent requests
- Implement intelligent retry logic
- Cache frequently accessed data

## Cost Optimization

### Cloud Resources
- Use spot instances for non-critical workloads
- Implement auto-scaling based on demand
- Monitor and optimize resource usage

### Data Storage
- Use appropriate storage classes
- Implement data lifecycle policies
- Compress data where possible 