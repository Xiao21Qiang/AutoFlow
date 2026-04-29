# AutoFlow Web Railway Deployment

AutoFlow Web deploys as one Railway service:

- Express runs the production server.
- Express serves the React production build from `build/`.
- React calls the API with same-origin `/api/...` URLs in production.
- MongoDB runs in a hosted cloud database such as MongoDB Atlas.

## Project Structure

- `src/` - React 19 app, routes, screens, components, utilities, and plain CSS.
- `public/` - CRA public files and static assets such as `checklist.pdf`.
- `server/server.js` - Express 5 API and production server entry.
- `server/db.js` - Mongoose connection setup.
- `server/models.js` - Mongoose schemas/models.
- `package.json` - root scripts for build/start/dev.

## Railway Steps

1. Push the repository to GitHub.
2. In Railway, create a new project.
3. Choose **Deploy from GitHub repo** and select the AutoFlow Web repository.
4. Set the service root to the repository root.
5. Configure the build and start commands:

```bash
npm run build
npm start
```

6. Add the required environment variables in Railway.
7. Deploy.

## Required Environment Variables

```bash
NODE_ENV=production
PORT=
MONGO_URI=
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=
CORS_ORIGIN=
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
```

Notes:

- Railway injects `PORT` automatically. Leave it blank unless you have a special reason.
- Use `MONGO_URI`, `MONGODB_URI`, or `MONGO_URL` for the production MongoDB connection string.
- `CORS_ORIGIN` is optional for same-service deployment. If you later add a custom frontend domain or separate frontend service, set it to that origin. Multiple origins can be comma-separated.
- Railway Hobby blocks outbound SMTP. Use Resend HTTPS email in production with `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`.
- `EMAIL_USER` and `EMAIL_PASS` are optional local SMTP fallback variables only when using `EMAIL_PROVIDER=smtp`. Do not rely on SMTP for Railway Hobby.
- `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are optional one-time production setup variables. If set, AutoFlow creates that admin only when the email does not already exist. Remove them after the account is created and change the password after first login.
- `REACT_APP_API_URL` should usually be blank in Railway so React uses same-origin `/api/...` calls.
- `REACT_APP_PUBLIC_CLIENT_URL` can be set to your public Railway/custom domain if QR codes must encode a fixed domain.

## Email / OTP on Railway Hobby

AutoFlow sends signup verification and password-change OTP emails through one backend email sender.

For Railway Hobby:

1. Create a Resend account.
2. Create an API key in Resend.
3. Verify your sending domain or configure an allowed sender address.
4. Add these Railway variables:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=All Pro-Tec <noreply@yourdomain.com>
```

5. Redeploy after saving the variables.

For local development only, SMTP can still be used if you set:

```bash
EMAIL_PROVIDER=smtp
EMAIL_USER=your.gmail@example.com
EMAIL_PASS=your-google-app-password
EMAIL_FROM=All Pro-Tec <your.gmail@example.com>
```

SMTP is optional and should not be used as the production email path on Railway Hobby.

## MongoDB Atlas Setup

1. Create a MongoDB Atlas cluster.
2. Create a database user with a strong password.
3. Add Railway outbound access to Atlas Network Access. For a simple student/project deployment, `0.0.0.0/0` works, but a narrower allowlist is better when available.
4. Copy the Atlas connection string.
5. Set it as `MONGO_URI` or `MONGODB_URI` in Railway.
6. Do not commit the real connection string.

Local accounts do not automatically exist in production. Railway connects to the MongoDB Atlas database in `MONGO_URI` / `MONGODB_URI` / `MONGO_URL`, so users from your local MongoDB are not available unless you import them or create them in production.

On first production startup, AutoFlow seeds default records when the database is empty. The built-in setup accounts are:

```text
Admin: admin@allprotec.com / Admin@123
Staff: staff@allprotec.com / Staff@123
Customer: customer@allprotec.com / Customer@123
```

Use these only for initial setup, then change/delete them immediately from the admin screens.

For a safer production admin, set these Railway variables once:

```bash
ADMIN_SEED_EMAIL=your-admin@example.com
ADMIN_SEED_PASSWORD=change-this-strong-password
ADMIN_SEED_NAME=Your Name
ADMIN_SEED_PHONE=
```

AutoFlow will create that admin only if the email does not already exist. After the account appears in the deploy logs, remove the seed variables from Railway and change the admin password after first login.

## Domain Setup Later

Railway provides a generated domain after deployment. You can add a custom domain later from the service settings.

After adding a custom domain:

- Update `CORS_ORIGIN` only if another origin must call the API.
- Update `REACT_APP_PUBLIC_CLIENT_URL` if QR codes should use the custom domain.
- Redeploy after changing build-time `REACT_APP_*` variables.

## Local Development

Use the development script:

```bash
npm run dev
```

This runs the Express API and CRA development server together.

For local development, set:

```bash
MONGO_URI=mongodb+srv://...
API_PORT=4000
CLIENT_PORT=3000
REACT_APP_API_URL=http://localhost:4000
EMAIL_PROVIDER=smtp
EMAIL_USER=your.gmail@example.com
EMAIL_PASS=your-google-app-password
EMAIL_FROM=All Pro-Tec <your.gmail@example.com>
```

## Troubleshooting

### React Refresh 404

If `/admin`, `/staff`, `/client`, `/tracking/:id`, or `/tracking/:id/warranty` returns 404 on refresh, confirm Railway is running:

```bash
npm start
```

The Express production server serves `build/index.html` for non-API routes.

### Missing PORT

Railway sets `PORT` automatically. Locally, the server falls back to `4000`.

### Missing MONGO_URI

The server fails clearly if no MongoDB URI is configured. Set `MONGO_URI`, `MONGODB_URI`, or `MONGO_URL`.

If login says valid local credentials are invalid in production, check the Railway deploy logs for:

```text
[startup] MongoDB { state: 'connected', database: '...', env: 'MONGO_URI' }
```

That database is the production source of truth. Local MongoDB users are separate from production Atlas users.

### OTP Email Errors

For Railway Hobby, deploy logs should show:

```text
[startup] Email { provider: 'resend', hasResendApiKey: true, from: 'All Pro-Tec <noreply@allprotecph.com>' }
```

If `hasResendApiKey` is false, set `RESEND_API_KEY` in Railway. If Resend rejects the message, check Resend Logs and confirm the sending domain is verified and `EMAIL_FROM` uses that domain.

### Localhost API Errors In Production

Do not set `REACT_APP_API_URL` in Railway unless the API is hosted separately. When blank, the frontend uses same-origin `/api/...` requests.

### CORS Issues

For a single Railway service, same-origin requests should not need special CORS settings. If an external site must call the API, add that exact origin to `CORS_ORIGIN`.

### Build Failures

Run locally first:

```bash
node --check server/server.js
npm run build
```

Fix compile errors before redeploying. Existing lint warnings may appear during CRA builds; they do not block deployment unless the build exits non-zero.
