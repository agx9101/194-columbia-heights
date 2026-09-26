# Animate Lot — reusable client portal

Dedicated deployment branch: `portal-template-136-e56-11j`.
**Do not merge into main or redeploy the existing 194 Columbia Heights service.**

This branch reuses the 194 portal's base stylesheet, with a new authenticated, data-driven frontend. There are no client documents, personal contacts, live credentials or client financial records in this branch. Actual project identifiers and the deployment handoff are in the private Notion PROJECT OS.

## Status
Prepared for a separate Render service. Deployment, live Notion connectivity and end-to-end acceptance remain pending workspace confirmation and secure environment configuration. A `render.yaml` is a deployment definition, not evidence that a service exists.

## Local use
Node 22. No runtime dependencies.

```sh
cp .env.example .env
# Fill .env privately, then:
node --env-file=.env server.mjs
npm run build
npm test
```

## Render
Use this branch and a NEW web service, proposed name `136-e56-11j-client-portal`. Plan `free`; build `npm run build`; start `npm start`; health `/health`. Leave the existing service and its plan untouched. Set the environment variables from the private Notion deployment handoff. All six data source IDs are required; use data source IDs, not database-container IDs.

`PORTAL_PASSWORD` requires at least 12 characters; `PORTAL_SESSION_SECRET` requires at least 32 random characters. Put `NOTION_API_TOKEN` in Render, never in this repo. The deployed integration must have read access to the project and every source database, including the new shared Project Milestones database. The ChatGPT Notion connection is separate from the website integration.

## Data / privacy behavior
- The complete dashboard and `/api/project` require a signed project session. The unauthenticated HTML contains no project data.
- The project and each published row require explicit `Client Visible = true`. Every row is queried and checked against the configured Project relation; visitors cannot select another project by URL parameter.
- Sources: Projects page; Scopes & Contracts; Payments; Project Assets; Project Updates; Project Milestones; FFE. Exact existing field names are used.
- Payments must relate to the Project AND Scope. Received funds are computed from visible `Paid` payment records; Upcoming is not paid, issued or overdue. Remaining contract fee is not an amount-due calculation. Keep the client payment ledger complete for accurate client-facing totals.
- Assets publish only when `Status = Current`, `Current = checked` and `Client Visible = checked`. Attach `File` or `External URL`; use actual issue dates.
- Hero image: first JPG/PNG/WebP/GIF in the Project's `Files & media` property. No other project's cover is used. Expiring Notion URLs refresh with the project response.
- Undated milestones stay visible as 'To be agreed'. Completed dates are separate from target dates.
- FF&E is conditional on `Show FFE`; price disclosure additionally requires project `Show Financials` and item `Show Pricing`. Procurement status is separate from selection approval.
- Signed-in, visible browser tabs refresh each minute. Server cache is 30 seconds. No webhook configuration or external keep-alive is required for this version. Free-service cold starts are not changed.
- No endpoint sends invoices, places orders, modifies Notion or emails clients. Authentication is a shared project password, not per-person accounts or MFA.

## Acceptance before client release
Verify the new service name/branch, Notion access and source mappings. Check all totals, undated milestones, mobile layout and published files. Test logout and unauthenticated API rejection. Change one published Notion update and confirm refresh. Upload the signed proposal and project axonometric in Notion. Save only the verified running URL to `Client Portal` after these checks.

API references: https://www.postman.com/notionhq/notion-s-api-workspace/collection/52041987-03f70d8f-b6e5-4306-805c-f95f7cdf05b9 and https://render.com/docs/blueprint-spec . Notion API is deliberately pinned to 2025-09-03.
