# CMMC Document Management Setup Guide

## Prerequisites

1. **Database Setup**: Ensure PostgreSQL is running and `DATABASE_URL` is set in `server/.env`
2. **CMMC Bundle**: The CMMC bundle should be extracted to `docs/cmmc-extracted/`

## Step 1: Database Migration

Run the Prisma migrations to create the CMMC tables:

```bash
cd server
npx prisma generate
npx prisma db push
```

## Step 2: Ingest CMMC Documents

### Option A: Via Admin UI (Recommended)

1. Start the backend server:
   ```bash
   cd server
   npm run dev
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

3. Log in as a System Administrator
4. Navigate to **CMMC Admin** in the sidebar
5. Click **"Sync Manifest & Files"** button
6. Wait for the sync to complete - you'll see a summary of processed/created/updated documents

### Option B: Via API (Alternative)

If you prefer to use the API directly:

```bash
# Get your auth token first (login via UI or API)
TOKEN="your-jwt-token-here"

# Run sync
curl -X POST http://localhost:3001/api/cmmc/documents/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

## Step 3: Verify Documents

1. Navigate to **CMMC Documents** in the sidebar
2. You should see all documents organized by category
3. Click on any document to view it

## Step 4: Sign Documents

1. Open a document from the CMMC Documents registry
2. Review the document content
3. Click **"Sign Document"** in the right sidebar
4. Choose your signature method:
   - **Typed**: Enter your full legal name and password
   - **Drawn**: Draw your signature on the canvas
   - **Clickwrap**: Type "I UNDERSTAND" to acknowledge
5. Select your role (Approver or Acknowledger)
6. Click **"Sign Document"**

## Features

### Document Registry
- Browse documents by category (System Scope, Policies & Procedures, etc.)
- Search by code or title
- Filter by kind, status, or review cadence
- View document status and latest revision

### Document Viewer
- Premium document layout with cover page (toggleable)
- Document control table with metadata
- Sticky table of contents
- Watermark overlay for non-effective documents
- Enhanced markdown rendering with custom components

### Signing
- Multiple signature methods (typed, drawn, clickwrap)
- Role-based signing (Approver/Acknowledger)
- Immutable signed revisions with SHA-256 hashing
- Signature history tracking

### Evidence Page
- Document control details
- Hash verification (content hash and signing hash)
- Tamper detection (compares current file vs signed revision)
- Complete signature history
- Copy hash functionality

### Admin Tools
- Sync manifest and files from bundle
- Update document status (Draft, In Review, Effective, Retired)
- View all documents in a table

## Troubleshooting

### Documents not showing after sync
- Check that the bundle is extracted to `docs/cmmc-extracted/`
- Verify the manifest file exists at `docs/cmmc-extracted/qms-ingest-manifest.json`
- Check server logs for parsing errors

### Signing fails
- Ensure you're logged in
- Check that the document has a revision (run sync if needed)
- Verify you haven't already signed this revision

### Permission errors
- Ensure you're logged in with appropriate role
- System Admin role required for sync and status updates
- All authenticated users can view and sign documents

## File Structure

```
docs/
  cmmc-extracted/
    qms-ingest-manifest.json
    docs/
      01-system-scope/
      02-policies-and-procedures/
      04-self-assessment/
      05-evidence/
      06-supporting-documents/
      tables/
```

## Environment Variables

Set in `server/.env`:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT token signing
- `CMMC_BUNDLE_PATH`: (Optional) Custom path to CMMC bundle (defaults to `docs/cmmc-extracted`)