# FamilyQuest Quick Start

Get FamilyQuest up and running in 5 minutes.

## 1. Clone & Install
```bash
cd family-tasks
npm install
```

## 2. Set Up Supabase

Visit https://supabase.com and create a free project.

Copy your credentials:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase URL and anon key:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyxxxxx
```

## 3. Create Database

1. Go to Supabase SQL Editor
2. Open `supabase/migrations/001_initial_schema.sql`
3. Copy entire SQL and run in editor
4. Done! Database is seeded with photo challenges

## 4. Create Storage Bucket

1. Go to Supabase Storage
2. Create new bucket: `task-photos` (make it public)
3. Create RLS policy:
   - Authenticated users can upload to `task-submissions/*`
   - Anyone can read `task-submissions/*`

## 5. Run Dev Server
```bash
npm run dev
```

Open http://localhost:3000

## First Login

1. Enter any email address
2. Check your email for magic link
3. Click link to authenticate
4. Complete family setup:
   - Enter family name
   - Add children with avatar emojis
   - Submit

## Create Tasks

As parent:
1. Go to Tasks
2. Paste task names:
   ```
   Clean kitchen
   Do dishes
   Take out trash
   ```
3. Click "Parse Tasks"
4. Configure each task
5. Click "Save All Tasks"

## Generate Today's Tasks

Call the API to generate task instances:
```bash
curl -X POST http://localhost:3000/api/generate-task-instances
```

Or add to cron job (Vercel Cron, GitHub Actions, etc.)

## Child View

Child logs in and sees:
- Today's quests in home screen
- Can click "Complete" to take photo
- App shows photo challenge prompt
- Takes photo from camera
- Submits for parent approval

## Parent Review

As parent:
1. Go to Review
2. See submitted tasks with photos
3. Click "Approve" or "Reject"
4. XP awarded automatically

## Key URLs

- **Parent**: http://localhost:3000/dashboard
- **Child**: http://localhost:3000/home
- **Login**: http://localhost:3000/login
- **API**: POST http://localhost:3000/api/generate-task-instances

## Troubleshooting

**Can't log in?**
- Check email spam folder
- Verify Supabase auth is enabled
- Check URL in auth redirect settings

**Photos not uploading?**
- Verify `task-photos` bucket exists and is public
- Check RLS policies allow authenticated access
- Check network tab for upload errors

**No task instances showing?**
- Run `/api/generate-task-instances` endpoint
- Check task template recurrence matches today
- Verify children are assigned to templates

**Tasks not appearing for child?**
- Log in as parent and create tasks
- Assign tasks to the child
- Call generate endpoint
- Child will see tasks after reload

## Demo Flow

1. **Parent creates account** → Family setup
2. **Parent adds 2 kids** → Emma (🦁) and Liam (🐯)
3. **Parent creates 3 tasks** → Assign to both kids
4. **Call task generation** → Task instances created
5. **Child logs in** → Sees today's quests
6. **Child completes task** → Takes photo, submits
7. **Parent reviews** → Approves with XP
8. **Child sees progress** → XP added, level progress shown

## Customization

### Change theme colors
Edit `tailwind.config.ts`:
```ts
primary: '#0f766e', // teal
secondary: '#c2410c', // orange
```

### Add XP levels
Edit `src/lib/utils.ts`:
```ts
export const XP_LEVELS = [
  { level: 1, name: 'Rookie', xpRequired: 0 },
  // ...
]
```

### Modify categories
Edit `src/app/(parent)/tasks/page.tsx`:
```ts
const CATEGORIES = [
  'Kitchen', 'Bedroom', // ...
]
```

## What's Included

✓ Complete dark glassmorphic UI
✓ Parent & child interfaces
✓ Photo proof system with challenges
✓ XP & level progression
✓ Privilege gating system
✓ Bonus/bounty board
✓ Family standings & leaderboard
✓ PWA ready (offline, install)
✓ Mobile-first design
✓ TypeScript throughout
✓ React Query for state
✓ Supabase real-time ready

## Next Steps

1. Deploy to Vercel (`vercel deploy`)
2. Set up daily cron to generate tasks
3. Add push notifications
4. Customize theme colors
5. Modify categories and XP levels
6. Add more photo challenge prompts

## Support Files

- `SETUP.md` - Detailed setup guide
- `IMPLEMENTATION_SUMMARY.md` - Complete feature list
- `supabase/migrations/001_initial_schema.sql` - Database schema
- `.env.local.example` - Environment template

Enjoy FamilyQuest! 🎮
