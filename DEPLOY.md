# Deploying RedAnt on Vercel + Supabase

## 1. Supabase (one time)
1. Create a project at supabase.com.
2. SQL Editor -> run these three files in order:
   1. `supabase/schema.sql`
   2. `supabase/data.sql`
   3. `supabase/update-2.sql`
3. Click Connect -> copy the **Transaction pooler** string (port 6543) and put your DB password in it.

## 2. Local test (optional)
    cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET
    npm install
    npm start                 # http://localhost:3000   (admin: /admin)

## 3. Admin password
The seeded admin (admin@redant.co.uk) still has the old default password. Change it:
    npm run set-admin-password -- "your-new-long-password"

## 4. Vercel
1. Push this folder to GitHub (node_modules, .env and redant.db are git-ignored).
2. Vercel -> Add New Project -> import the repo. Framework preset: Other. No build command.
3. Settings -> Environment Variables: add `DATABASE_URL` and `JWT_SECRET`.
4. Deploy, then add the domain under Settings -> Domains.

## Editing the website from /admin
- **Page Text**: every heading, paragraph, button, menu item, About Us, Contact and legal text.
  Fields you don't change keep the text written in `public/index.html`.
  Use `*stars*` around words in a heading to highlight them.
- **Contact Details**: WhatsApp, email and phone used by every button and the footer.
- **Service Pages / Services / Pricing / Portfolio / Testimonials / Who We Help / FAQs / Blog / Launch Offer**.
- Edits show on the live site within about 20 seconds (short CDN cache).

## Logos and favicon
Files are in `public/assets/` (`logo-full-light.png` for the dark header/footer, `logo-full.png`, `logo-icon.png`,
`favicon-32.png`, `apple-touch-icon.png`) plus `public/favicon.ico`. Replace the files to change them, or paste a
different image address under Page Text -> SEO & Branding.
