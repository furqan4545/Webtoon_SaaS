## webtoon.ai

Create beautiful, mobile-first webtoons with AI. Draft scenes, generate characters, and publish stunning webtoon panels in minutes.

### Getting Started

```bash
pnpm dev
# or
npm run dev
```

Open http://localhost:3000 to view the app. The home route redirects to login unless authenticated. Main editing experience lives in `app/webtoon-builder/`.

### Tech Stack
- Next.js App Router
- Supabase Auth + Storage
- shadcn/ui components
- Google Generative AI (Gemini)

### Environment
Copy `env.example` to `.env.local` and fill required keys.

### Deployment
Any Node-compatible host works. Configure environment variables and build with `next build`.
