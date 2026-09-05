# Encrypted video player

Paste an encrypted payload (`b64v1.…`) to decrypt and play a video in the browser. Clients never type the key — it lives in `PLAYBACK_SECRET` on the server.

You encrypt on your own machine with `npm run encrypt`, then send only the output text to the client.

## 1. Set the secret (local)

```bash
copy .env.example .env.local
```

Edit `.env.local` and replace the placeholder with a long random string. Use that **same** value in Vercel.

## 2. Encrypt on this computer

```bash
npm install
npm run encrypt -- --in clip.mp4 --out payload.txt
```

If you already have base64 instead of a video file:

```bash
npm run encrypt -- --in clip.b64 --out payload.txt
```

Send `payload.txt` to your client. Keep `PLAYBACK_SECRET` private.

## 3. Play

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste or attach the `b64v1.…` file, then click **Play**. Only encrypted payloads are accepted.

## Deploy on Vercel

1. Push this repo and import it at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Next.js**.
3. Add environment variable `PLAYBACK_SECRET` (same value as `.env.local`).
4. Deploy.

To rotate the secret: change `PLAYBACK_SECRET` in the Vercel dashboard and **redeploy**. Payloads encrypted with the old secret will no longer decrypt.

## PayPal download ($10)

Watching is free. **Download at higher quality** sends the client to PayPal. After a successful $10 payment the full-quality file starts downloading. Each download click requires a new payment.

1. Create an app at [developer.paypal.com](https://developer.paypal.com/dashboard/applications).
2. Add to `.env.local` (and Vercel):

```
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox
APP_URL=http://localhost:3000
```

3. Use `PAYPAL_MODE=live` and your live credentials in production. Set `APP_URL` to the public site URL (PayPal return links need it).

Restart `npm run dev` after changing env vars.

```bash
npx vercel
```

## Security

The player fetches the secret from `/api/playback` so the client only pastes encrypted text. Anyone who can open the site can also see that request in DevTools — this is **not** DRM. It stops casual sharing of a playable file. Do not put a highly sensitive master password here if that exposure is unacceptable.

Playback still depends on the browser supporting the codec (MP4, WebM, or Ogg).
