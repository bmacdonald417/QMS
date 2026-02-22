# Railway Setup Instructions

## Required Environment Variables for QMS Service

Add these environment variables to your **QMS service** (not the Postgres service):

1. **DATABASE_URL** - Use the internal Railway URL:
   ```
   postgresql://postgres:VbJDcWRTfqFoQUVCYFOEMllDUCGotEbD@postgres.railway.internal:5432/railway
   ```

2. **JWT_SECRET** - Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```
   Then set it as an environment variable.

3. **PORT** - Railway sets this automatically, but you can set it to `8080` if needed.

## How to Add Variables in Railway

1. Go to your QMS service in Railway dashboard
2. Click on "Variables" tab
3. Click "New Variable"
4. Add each variable:
   - Name: `DATABASE_URL`
   - Value: `postgresql://postgres:VbJDcWRTfqFoQUVCYFOEMllDUCGotEbD@postgres.railway.internal:5432/railway`
   
   - Name: `JWT_SECRET`
   - Value: (paste your generated secret)

5. Save and redeploy

## After Adding Variables

The service will automatically redeploy. Once it's running, the CMMC sync should work!
