# Ascend Capital account portal

This project contains an account/profile website, interactive simulated deposit and withdrawal showcase flows, and a Render Blueprint. Showcase submissions only appear in temporary browser activity; they do not accept payments, connect to Binance, move funds, change balances, approve withdrawals, or calculate payouts. Set `BINANCE_WALLET_ADDRESS` in Render to display the public receiving address in the dashboard header and deposit dialog. The address is served by the app at runtime, so it is not compiled into the frontend bundle.

## Deploy to Render

1. Push this project to a private GitHub repository.
2. In Render, choose **New → Blueprint** and select that repository.
3. Before creating the service, set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in the Blueprint environment prompt. Use a unique password of at least 12 characters.
4. Deploy the web service. Render assigns its public HTTPS address after the first successful build.
5. Sign in with the configured admin credentials and visit `/admin` to manage member display names.
6. Set `BINANCE_WALLET_ADDRESS` in the service environment. The address is public and visible to all site visitors; redeploy/restart the service after changing it.

Set a secure `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` when the Blueprint asks for required values. This creates the initial administrator. The administrator can only view member accounts and edit member display names. The role has no wallet, deposit, withdrawal, payout, or fund-approval controls.

## Free hosting storage limitation

The included Blueprint uses Render's free service and temporary `/tmp` storage. Accounts, sessions, and profile changes may be erased whenever the service restarts or redeploys. The initial administrator is recreated from its environment variables when the application starts, but ordinary member accounts are not. For reliable account persistence, use a paid service with persistent storage or migrate account data to a managed database before inviting users.

Creating the Blueprint does not itself publish or deploy this project. A GitHub repository and a Render account are needed to create the public site. The portal supports registration, login, member profile management, and the restricted member-admin page. Dashboard deposit and withdrawal forms are front-end-only demonstrations: submissions are labeled as not processed, saved only in page state, and disappear on reload. No financial transaction endpoints or payment integrations are configured. The user-provided investment and referral claims displayed on the dashboard are not verified.

## Run locally

Requires Node.js 24.

```powershell
npm install
npm run dev
```

To provision an administrator locally, set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in the server process environment before running `npm run dev`. Do not commit credentials to the repository.

Run checks with:

```powershell
npm test
npm run build
```
