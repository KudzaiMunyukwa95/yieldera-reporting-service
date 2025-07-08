# Yieldera Agricultural Reporting Service

🌾 An intelligent agricultural reporting system that automatically generates comprehensive agronomic reports when field data is updated. The system combines real-world farm data, weather intelligence, and AI-powered analysis to provide valuable insights for farmers, insurers, banks, and agricultural contractors.

## Features

- **Automated Report Generation**: Triggers reports when field data changes
- **Weather Integration**: Real-time weather data from Open Meteo API
- **AI-Powered Analysis**: GPT-4 driven agronomic insights and recommendations
- **Multi-Stakeholder Reports**: Tailored content for farmers, insurers, banks, and contractors
- **Email Delivery**: Professional HTML reports sent automatically
- **Crop-Specific Intelligence**: Detailed analysis by crop type and variety
- **Risk Assessment**: Comprehensive risk analysis including weather, pests, and diseases

## Architecture

```
Mobile App → Database → Report Queue → Processing Service → AI Analysis → Email Reports
```

The system monitors the `report_queue` table for new entries (created by database triggers) and processes them automatically every 2 minutes.

## Prerequisites

Before deploying, ensure you have:

1. **Database Setup**: MySQL/MariaDB database with the required tables
2. **Email Service**: SMTP email server configured
3. **OpenAI API Key**: For AI-powered analysis
4. **Render Account**: For deployment

## Database Setup

1. **Create the report_queue table** (if not exists):
   ```sql
   -- Run the SQL commands from database/report_queue.sql
   ```

2. **Verify database triggers** are working on the `fields` table to populate the report queue

## Deployment Instructions for Render

### Step 1: Prepare Your Files

1. Create a new folder on your computer called `yieldera-reporting`
2. Download/copy all the following files into this folder:
   - `package.json`
   - `index.js`
   - `services/databaseService.js`
   - `services/emailService.js`
   - `services/weatherService.js`
   - `services/reportService.js`
   - `database/report_queue.sql`
   - `README.md`
   - `.env.example`

### Step 2: Create GitHub Repository

1. Go to [GitHub.com](https://github.com) and create a new repository
2. Name it `yieldera-reporting-service`
3. Initialize it as public (or private if you prefer)
4. Upload all your files to this repository

### Step 3: Deploy to Render

1. **Go to Render Dashboard**:
   - Visit [render.com](https://render.com)
   - Sign in to your account

2. **Create New Web Service**:
   - Click "New +" button
   - Select "Web Service"
   - Choose "Build and deploy from a Git repository"

3. **Connect Repository**:
   - Connect your GitHub account if not already connected
   - Select your `yieldera-reporting-service` repository
   - Click "Connect"

4. **Configure Service**:
   - **Name**: `yieldera-reporting-service`
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or `master`)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

5. **Set Environment Variables**:
   Click "Advanced" and add these environment variables:

   ```
   DB_HOST=yieldera.co.zw
   DB_NAME=yielderaco_app
   DB_USER=yielderaco_app
   DB_PASSWORD=Shayne12?
   EMAIL_HOST=mail.yieldera.co.zw
   EMAIL_PORT=465
   EMAIL_USER=reports@yieldera.co.zw
   EMAIL_PASSWORD=Shayne12?
   EMAIL_FROM=Yieldera Reports <reports@yieldera.co.zw>
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=10000
   NODE_ENV=production
   ```

   **🔒 IMPORTANT**: Replace `your_openai_api_key_here` with your actual OpenAI API key when setting up environment variables in Render. Never commit the real API key to your repository.

6. **Deploy**:
   - Click "Create Web Service"
   - Render will automatically build and deploy your service
   - Wait for deployment to complete (usually 3-5 minutes)

### Step 4: Verify Deployment

1. **Check Service Health**:
   - Visit your service URL: `https://your-service-name.onrender.com/health`
   - Should return: `{"status": "healthy", "timestamp": "...", "service": "Yieldera Reporting Service"}`

2. **Check Status**:
   - Visit: `https://your-service-name.onrender.com/status`
   - Should show pending reports count and system status

3. **Test Manual Trigger** (optional):
   - POST to: `https://your-service-name.onrender.com/trigger-reports`
   - This will manually process any pending reports

## How It Works

### 1. Data Collection
- Mobile app collects field data offline
- Data syncs to database when connectivity restored
- Database triggers create entries in `report_queue`

### 2. Report Processing
- Service polls report queue every 2 minutes
- Fetches comprehensive farm and field data
- Retrieves weather data from Open Meteo API
- Generates AI analysis using OpenAI GPT-4

### 3. Report Generation
- Creates professional HTML reports with:
  - Farm overview and statistics
  - Weather analysis and alerts
  - Crop-specific insights
  - Risk assessments
  - AI-powered recommendations
  - Field-level details

### 4. Email Delivery
- Sends personalized reports to stakeholders
- Content tailored by user type (farmer, insurer, bank, etc.)
- Professional formatting with charts and insights

## Report Types

The system generates different types of reports based on triggers:

- **Field Registration Report**: When new fields are added
- **Field Assessment Update**: When field data is modified
- **Crop Development Report**: When growth stages change
- **Loss Assessment Report**: When losses are reported
- **Weather Impact Report**: When weather alerts are detected
- **Pest & Disease Report**: When pest/disease issues are reported

## API Endpoints

- `GET /health` - Service health check
- `GET /status` - Service status and queue count
- `POST /trigger-reports` - Manually trigger report processing

## Monitoring and Logs

- Check Render dashboard for service logs
- Monitor email delivery status
- Review OpenAI API usage in OpenAI dashboard
- Database logs for queue processing

## Troubleshooting

### Common Issues:

1. **Database Connection Failed**:
   - Verify database credentials in environment variables
   - Check database server accessibility
   - Ensure database tables exist

2. **Email Not Sending**:
   - Verify SMTP credentials
   - Check email server settings
   - Review spam folders

3. **AI Analysis Not Working**:
   - Verify OpenAI API key is correct
   - Check API usage limits
   - Review OpenAI account status

4. **Reports Not Processing**:
   - Check report_queue table for entries
   - Verify database triggers are working
   - Check service logs for errors

### Getting Support:

For technical support, check:
1. Render service logs
2. Database query logs
3. Email delivery logs
4. OpenAI API logs

## Cost Considerations

**Render Hosting**: ~$7/month for basic plan
**OpenAI API**: ~$0.02 per 1K tokens (approximately $1-5/month depending on usage)
**Total Estimated Cost**: $10-15/month

## Security Notes

- **🔒 Never commit API keys**: Always use environment variables for sensitive data
- **📁 Use .env.example**: Template file with placeholder values only
- **🚫 Check .gitignore**: Ensures .env files are never committed
- All environment variables are encrypted on Render
- Database connections use SSL
- Email communications are secured
- OpenAI API communications are encrypted
- No sensitive data is logged

### 🔐 API Key Security Checklist:
- ✅ Use placeholders in .env.example
- ✅ Set real values only in Render environment variables
- ✅ Never commit .env files to repository
- ✅ Regularly rotate API keys
- ✅ Monitor API usage for unusual activity

## Future Enhancements

- SMS notifications for critical alerts
- Multi-language report support
- Advanced analytics dashboard
- Integration with more weather providers
- Satellite imagery analysis
- Predictive yield modeling

---

**Built for Yieldera Agricultural Platform**
*Empowering Agriculture Through Data Intelligence*
