# Migration: reviewer questionnaire and draft round

If production was deployed before this migration ran, run the following SQL against your production database (e.g. Railway → PostgreSQL → Query / Data tab):

```sql
ALTER TABLE "documents" ADD COLUMN "draft_round" INTEGER;
ALTER TABLE "document_assignments" ADD COLUMN "review_responses" JSONB;
```

Or from a shell with `DATABASE_URL` set to production:

```bash
cd server && npx prisma migrate deploy
```
