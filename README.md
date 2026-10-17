# Venky Builds website with email backend

Visitors fill in the project form -> `/api/contact` (Vercel serverless function) -> email to venkybuilds67@gmail.com.

## 1. Create a Gmail App Password
1. Sign in to the Gmail account that will SEND the emails (venkybuilds67@gmail.com works).
2. Turn on 2-Step Verification: myaccount.google.com/security
3. Create an App Password: myaccount.google.com/apppasswords
4. Copy the 16-character password. Keep it secret.

## 2. Deploy on Vercel
1. Put this folder in a GitHub repo (or run `npx vercel` inside it).
2. In Vercel > Project > Settings > Environment Variables add:
   - `GMAIL_USER` = venkybuilds67@gmail.com
   - `GMAIL_APP_PASSWORD` = the App Password from step 1
   - `CONTACT_TO` = venkybuilds67@gmail.com (where enquiries arrive)
3. Redeploy so the variables take effect.

## 3. Test
Open your live site, send the form, and check the inbox (and spam the first time).
Replying to the email goes straight to the visitor (Reply-To is set).

## Notes
- Spam protection: hidden honeypot field plus a simple per-IP limit (5 per 10 minutes).
- If the backend is unreachable, the form falls back to opening the visitor's email app.
- To change the receiving address later, edit `CONTACT_TO` in Vercel. No code change needed.
