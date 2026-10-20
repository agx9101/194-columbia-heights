# 194 Columbia Heights: ACC PDF deliverables

Prepared on branch `acc-pdf-deliverables-194ch`. Not yet deployed or live-verified: Autodesk sign-in is blocked at email verification and APS app credentials are not configured.

The requested source is the ACC project `7c9a9f22-e8e8-4ada-8416-633a345b627b`, folder `urn:adsk.wipprod:fs.folder:co.zmH2sK-2Q8m8XAiGdsP7YQ`. The folder's display name must be verified after sign-in; the portal reads it from ACC rather than guessing.

When enabled, Latest Plans & Deliverables reads this folder and all descendants. Columns are Folder, File name, Updated, and PDF. The folder column includes the root name and relative path. Only current PDF item versions are included; deleted items and other file types are excluded. Replacing a file with a new ACC version updates the single row. Distinct ACC files with the same name in different folders remain separate rows. Updated is ACC's modification timestamp, not an invented issue date.

No PDFs are copied to Notion or committed to GitHub. The portal obtains a one-minute download URL from Autodesk on an authenticated request. File metadata is hidden until the existing project password is entered. Each download rechecks membership in the selected folder tree. API credentials and storage identifiers stay server-side.

## Activation

1. Resolve Autodesk sign-in and inspect the selected ACC folder and existing custom integrations.
2. Use an approved APS server application with OAuth v2 client credentials and `data:read`. The ACC account administrator must authorize that application through Custom Integrations. Confirm the app's access model and permissions before granting access; if the account requires an SSA or delegated user flow, complete that setup before activation.
3. Configure the following only on `194-columbia-heights-live` (`srv-dacp02favr4c73er65ug`) in Render. Enter the app secret securely; never put it in this repository, Notion, or chat.

```
ACC_ENABLED=true
ACC_PROJECT_ID=7c9a9f22-e8e8-4ada-8416-633a345b627b
ACC_ROOT_FOLDER_ID=urn:adsk.wipprod:fs.folder:co.zmH2sK-2Q8m8XAiGdsP7YQ
APS_CLIENT_ID=<approved app client ID>
APS_CLIENT_SECRET=<secure input>
```

4. Deploy this branch only to the live Node service. Both existing 194CH services currently track main; changing the live service's branch avoids also deploying this backend change to the legacy static site. The 11J branch is separate.
5. Verify actual folder paths, nested PDFs, newest versions, non-PDF exclusions, download authentication, and empty/error states against ACC. Confirm the Autodesk signed-download destination works for this account/region. Do not describe mock tests as live verification.

With `ACC_ENABLED` unset or false, the existing Notion deliverables behavior is retained. When ACC is enabled but unavailable, only the deliverables panel reports unavailable; the rest of the dashboard remains usable. There is no silent fallback to an outdated Notion file list. Scope/payment attachments remain in Project Downloads.

## Checks

`npm run check` and `npm test` validate syntax, pagination, recursive paths, duplicate filenames, PDF filtering, deletion, API destination validation, file membership checks, and the existing password boundary. Live Autodesk integration still requires the activation steps above.

API references:
- https://get-started.aps.autodesk.com/tutorials/hubs-browser/data
- https://aps.autodesk.com/blog/migration-guide-oauth2-v1-v2
- https://aps.autodesk.com/blog/direct-s3-nodejs-samples
- https://help.autodesk.com/cloudhelp/ENU/Docs-Admin/files/hub-administration/Custom_Integrations.html
