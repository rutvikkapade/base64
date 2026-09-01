# Base64 to Video

Frontend-only Next.js app that decodes pasted base64 (raw or a `data:video/…;base64,` URL) into a video blob and plays it in the browser. Nothing is uploaded.

## Local

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste base64, choose a format if the paste is not a data URL, then click **Convert & play**.

## Deploy on Vercel

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Framework preset: **Next.js**. Leave build settings and environment variables at defaults.
4. Deploy.

Or from the CLI:

```bash
npx vercel
```

No API routes or server conversion — playback depends on the browser supporting the decoded codec (typically MP4, WebM, or Ogg).
