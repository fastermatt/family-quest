# FamilyQuest Setup Guide

## Overview
FamilyQuest is a family chore & task management PWA built with Next.js, Supabase, and React Query. It features a dark glassmorphic design with separate parent and child interfaces.

## Prerequisites
- Node.js 18+ and npm
- Supabase account
- Environment variables configured

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Supabase

1. Create a Supabase project at https://supabase.com
2. Copy your project URL and anon key
3. Create `.env.local` from `.env.local.example`:
   ```bash
   cp .env.local.example .env.local
   ```
4. Update `.env.local` with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

### 3. Run Database Migrations

1. Go to Supabase SQL Editor
2. Copy the entire SQL from `supabase/migrations/001_initial_schema.sql`
3. Paste and run it in the SQL Editor
4. Alternatively, use Supabase CLI: `supabase db push`

### 4. Create Storage Buckets

In Supabase Dashboard:
1. Go to Storage
2. Create new bucket: `task-photos` (public)
3. Create RLS policies to allow authenticated users to upload/read

### 5. Run Development Server
```bash
npm run dev
```

Visit http://localhost:3000

## User Flows

### Parent Setup
1. Sign in with email (magic link)
2. Complete family setup wizard
3. Add children and assign avatars
4. Access dashboard

### Parent Features
- **Dashboard**: View all children, their progress, and pending items
- **Tasks**: Create task templates with bulk entry, assign to children
- **Privileges**: Create unlockable rewards with completion gates
- **Bonus**: Create one-time bonus tasks and bounties
- **Review**: Approve/reject submitted tasks and privilege requests

### Child Features
- **Home**: View today's quests, complete tasks with photo proof
- **Rewards**: View achievements, request privileges, claim bounties
- **Quests**: Full quest history and upcoming tasks
- **Standings**: Family leaderboard and weekly stats

## Key Features

### Photo Proof System
- Tasks can require photo submissions
- Random photo challenges prompt kids to be creative
- Parents review photos before approval

### XP & Progression
- Children earn XP for completing tasks
- Level up through XP thresholds (Rookie → Legend)
- Current streaks and longest streaks tracked

### Privilege Gating
- Always Available: No requirements
- All Tasks: Must complete all assigned tasks
- Specific Tasks: Must complete specific task set

### Bonus System
- Open Bounties: Available to all children
- Assigned Bounties: For specific children
- Various reward types (XP, money, items, privileges)

## File Structure

```
src/
├── app/
│   ├── (auth)/login/        # Magic link login
│   ├── (parent)/            # Parent routes
│   │   ├── dashboard/       # Family overview
│   │   ├── tasks/          # Task management
│   │   ├── privileges/     # Privilege management
│   │   ├── bonus/          # Bonus board
│   │   ├── review/         # Approval center
│   │   └── family/setup/   # Family wizard
│   ├── (child)/            # Child routes
│   │   ├── home/           # Today's quests
│   │   ├── rewards/        # Achievements & requests
│   │   ├── quests/         # Quest history
│   │   └── standings/      # Leaderboard
│   ├── api/                # Backend routes
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   ├── ui/                 # Reusable components
│   ├── bottom-nav.tsx      # Child nav
│   └── parent-nav.tsx      # Parent nav
├── lib/
│   ├── supabase/          # Client/server clients
│   ├── types/             # TypeScript types
│   └── utils.ts           # Utilities & levels
└── middleware.ts          # Auth middleware

public/
├── manifest.json          # PWA manifest
└── icons/                 # PWA icons
```

## Design System

### Colors
- **Primary Teal**: `#0f766e` (dark), `#2dd4bf` (light)
- **Secondary Orange**: `#c2410c` (dark), `#fb923c` (light)
- **Dark Background**: `#020617`, `#0f172a`

### Components
- **Glass Cards**: `bg-white/5 backdrop-blur-xl border border-white/10 rounded-4xl`
- **Buttons**: Primary (teal), Secondary (orange), Ghost, Danger variants
- **Badges**: XP, Streak, Level, Status indicators

### Typography
- **Headings**: Manrope 700-800
- **Body**: Inter 400-700

## API Routes

### POST `/api/generate-task-instances`
Generates today's task instances based on recurrence patterns. Call daily.

Request:
```bash
curl -X POST http://localhost:3000/api/generate-task-instances
```

Response:
```json
{
  "success": true,
  "created": 5,
  "message": "Created 5 task instances for 2024-01-15"
}
```

## Deployment

### Vercel
```bash
npm run build
vercel deploy
```

### Environment Variables (Production)
Set all variables in Vercel project settings.

### PWA Installation
The app installs as PWA on mobile via manifest.json. Install prompt appears automatically.

## Database Queries

### Get child's daily tasks
```sql
SELECT * FROM task_instances
WHERE assigned_to = 'child_id'
AND due_date = current_date
ORDER BY status;
```

### Get pending approvals
```sql
SELECT * FROM task_instances
WHERE status = 'submitted'
ORDER BY submitted_at DESC;
```

## Customization

### Add New Task Categories
Edit categories in `/app/(parent)/tasks/page.tsx`

### Modify XP Levels
Edit `XP_LEVELS` in `src/lib/utils.ts`

### Change Theme Colors
Update Tailwind config in `tailwind.config.ts` and CSS variables in `globals.css`

## Troubleshooting

### Auth Not Working
- Check Supabase URL and keys in `.env.local`
- Verify auth is enabled in Supabase
- Check redirect URL in auth settings

### Storage Upload Failing
- Verify `task-photos` bucket exists and is public
- Check RLS policies allow authenticated uploads
- Ensure bucket storage limits not exceeded

### Task Instances Not Generating
- Call `/api/generate-task-instances` manually
- Check task template recurrence settings
- Verify children are assigned to templates

## Next Steps

1. Deploy to Vercel
2. Set up automated task generation (cron job)
3. Add push notifications for task reminders
4. Implement analytics and insights
5. Add photo verification AI (NSFW check)
