CodeBreaker — Static site

This repository contains a static HTML/CSS/JS site. Deployment to GitHub Pages is set up via GitHub Actions: `.github/workflows/deploy.yml`.

How it works:
- Push changes to the `main` branch.
- GitHub Actions will run the `deploy` workflow and publish the repository contents to the `gh-pages` branch using the `GITHUB_TOKEN` secret.

Notes:
- This project uses EmailJS for OTP delivery; no Netlify functions are required.
- If you previously used Netlify, there are no Netlify files in the workspace; if you see Netlify configuration in a remote repo or branch, remove those files there as needed.

If you want a different deployment target (GitHub Pages from `docs/`, a separate build step, or a Docker deploy), tell me and I can update the workflow.