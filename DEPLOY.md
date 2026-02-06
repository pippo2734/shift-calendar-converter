---
created: 2026-02-06T11:34
updated: 2026-02-06T11:34
---
# Deployment Guide

To share this app with your team, the easiest way is to deploy it to **Vercel**.
Vercel is the platform made by the creators of Next.js and is free for personal/hobby use.

## Prerequisites
- A GitHub account
- A Vercel account (can sign up with GitHub)

## Steps

1. **Push to GitHub**
   - Create a new repository on GitHub.
   - Push this code to the repository.
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   # Replace <YOUR_REPO_URL> with your actual GitHub repo URL
   git remote add origin <YOUR_REPO_URL>
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com/new](https://vercel.com/new).
   - Import your GitHub repository.
   - Keep the default settings (Framework: Next.js).
   - Click **Deploy**.

3. **Share the URL**
   - Once finished, Vercel will give you a URL (e.g., `shift-calendar-converter.vercel.app`).
   - Share this URL with your team!

## Note on Privacy
This app processes the PDF **entirely in the browser**. The PDF file is **NOT** uploaded to any server. This is great for privacy and security within the team.
