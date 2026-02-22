# QMS Deployment Status

## ✅ Deployment Complete

The QMS application has been successfully deployed to Railway.

### What's Deployed

1. **Backend API** (Express + Node.js)
   - Running on Railway
   - Connected to PostgreSQL database
   - Serving API endpoints at `/api/*`
   - Serving pre-built frontend from `dist/`

2. **Frontend** (React + Vite)
   - Pre-built and committed to repository
   - Served statically by Express server
   - All routes and features available

3. **Database** (PostgreSQL on Railway)
   - Schema includes CMMC tables
   - 61 CMMC documents already ingested
   - User roles and permissions configured

### Environment Variables Set

- ✅ `DATABASE_URL` - Internal Railway PostgreSQL connection
- ✅ `JWT_SECRET` - Secure token signing secret
- ✅ `PORT` - Automatically set by Railway

### CMMC Document Management

**Status:** ✅ Ready to use

- 61 CMMC documents ingested into database
- Document registry available at `/cmmc`
- Document viewer with signing capability
- Evidence page for audit trails
- Admin sync tools available

### Access the Application

- **Production URL:** https://quality.mactechsolutionsllc.com
- **API Health Check:** https://quality.mactechsolutionsllc.com/api/health

### Next Steps

1. **Log in** to the application
   - Use demo credentials (e.g., `alex.admin@qms.demo` / `Password123!`)
   - Or create new users via the System Management interface

2. **Access CMMC Documents**
   - Navigate to "CMMC Documents" in the sidebar
   - Browse documents by category
   - View and sign documents

3. **Sync Documents (if needed)**
   - Go to "CMMC Admin" (System Admin only)
   - Click "Sync Manifest & Files" to refresh from local bundle
   - Documents are read from `docs/cmmc-extracted/` in the repository

### Maintenance

**When updating frontend code:**
1. Run `npm run build` locally
2. Commit the updated `dist/` folder
3. Push to trigger Railway deployment

**When updating backend code:**
- Just push to git - Railway will automatically rebuild and redeploy

### Database Migrations

If you need to run migrations or seed data:
- Use Railway's one-off command feature
- Or connect via Railway CLI: `railway run npx prisma db push`

### Troubleshooting

- Check Railway logs for any errors
- Verify environment variables are set correctly
- Ensure database connection is working
- Check that `dist/` folder is committed and up to date
