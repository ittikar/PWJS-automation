# Ittikar Regression Test Suite

This document describes what each Playwright test in `tests/` does: the accounts and data it uses, every action it takes in the app, what it checks, and what it writes back for later tests.

All tests run against the SIT environment: `https://sit-ireland-dashboard.ittikar.com`.

## Contents

1. [How the suite fits together](#1-how-the-suite-fits-together)
2. [Running the tests](#2-running-the-tests)
3. [Accounts and test data files](#3-accounts-and-test-data-files)
4. [Test cases](#4-test-cases)
   - [TC-REG-001: Sign up a new organisation](#tc-reg-001-sign-up-a-new-organisation)
   - [TC-REG-033: Log in as the new user](#tc-reg-033-log-in-as-the-new-user)
   - [TC-REG-044: New user's dashboard and organisation](#tc-reg-044-new-users-dashboard-and-organisation)
   - [TC-REG-074: Self-service onboarding (AUM details)](#tc-reg-074-self-service-onboarding-aum-details)
   - [TC-REG-111: Invite Normal and Admin users](#tc-reg-111-invite-normal-and-admin-users)
   - [TC-REG-134: Create portfolios in every asset group](#tc-reg-134-create-portfolios-in-every-asset-group)
   - [TC-REG-146: Create opportunities in every asset group](#tc-reg-146-create-opportunities-in-every-asset-group)
   - [TC-REG-168: Create club deals in every asset group](#tc-reg-168-create-club-deals-in-every-asset-group)
   - [TC-REG-203: Run due diligence on published deals](#tc-reg-203-run-due-diligence-on-published-deals)
   - [TC-REG-217: Request and approve club deal data rooms](#tc-reg-217-request-and-approve-club-deal-data-rooms)
5. [Page objects and helpers](#5-page-objects-and-helpers)
6. [App behaviour the tests work around](#6-app-behaviour-the-tests-work-around)
7. [Known issues and open items](#7-known-issues-and-open-items)
8. [API tests (`api-tests/`)](#8-api-tests-api-tests)

---

## 1. How the suite fits together

The tests fall into two independent chains.

**New-user chain.** These tests run in order, because each one reads the account that TC-REG-001 created.

```
TC-REG-001  signs up a new organisation  ──►  test-data/signupResults.json
     │
     ├─► TC-REG-033  logs in as that user
     ├─► TC-REG-044  checks the new user's dashboard and organisation
     └─► TC-REG-074  completes self-service onboarding (AUM details)
```

**Deal chain.** These tests use a fixed, already-onboarded account (see [Accounts](#3-accounts-and-test-data-files)).

```
TC-REG-134  portfolios      ┐
TC-REG-146  opportunities   ├─► deals become Published ~15 min after submission
TC-REG-168  club deals      ┘
     │
     ├─► TC-REG-203  runs due diligence on Published portfolios and opportunities
     └─► TC-REG-217  requests club deal data rooms from a second account, owner approves
```

TC-REG-111 (inviting users) is standalone.

**API tests.** `api-tests/` covers the same features by calling the backend directly, without a browser, using the deal-chain accounts. See [section 8](#8-api-tests-api-tests).

The five asset groups used by every deal test are Private Equity, Real Asset, Secondary & Pre-IPO, Private Credit, and Other Alternatives.

## 2. Running the tests

Run tests that share an account **one at a time** (`--workers=1`). The Playwright config runs tests in parallel by default, and two tests logged in to the same account at once interfere with each other.

| What | Command |
|---|---|
| New-user chain | `npx playwright test tests/TC-REG-001.spec.js tests/TC-REG-033.spec.js tests/TC-REG-044.spec.js tests/TC-REG-074.spec.js --project=chromium --workers=1` |
| Deal chain | `npx playwright test tests/TC-REG-134.spec.js tests/TC-REG-146.spec.js tests/TC-REG-168.spec.js tests/TC-REG-203.spec.js tests/TC-REG-217.spec.js --project=chromium --workers=1` |
| One test, visible browser | `npx playwright test tests/TC-REG-217.spec.js --project=chromium --headed` |
| `npm run suite` | Runs every `.spec.js` file in `tests/`, headed, one at a time, with no retries. They run in file-name order: 001 → 033 → 044 → 074 → 111 → 134 → 146 → 168 → 203 → 217. A new spec file is picked up automatically. TC-REG-001 waits for you to enter the OTP. |
| `npm run regression` | Runs 001, 033, 044, 074, 111, 134, 146 and 168 headed, one worker, one retry. It does **not** include 203 or 217. |
| `npm run api` | Runs every API test in `api-tests/` (no browser), one at a time. About 4–5 minutes. See [section 8](#8-api-tests-api-tests). |
| HTML report | `npx playwright show-report` |

Files run in alphabetical order with one worker, so the commands above keep the chains in sequence.

**Typical durations:** each deal-creation test takes about 2 minutes, TC-REG-203 about 1 minute, TC-REG-217 about 2 minutes, and the whole deal chain about 8–10 minutes.

## 3. Accounts and test data files

### Accounts

| Account | Organisation | Used by | Where it's set |
|---|---|---|---|
| Newly generated `user<timestamp>@yopmail.com` | Newly generated | 001, then 033, 044, 074 | Created by TC-REG-001 and saved to `signupResults.json` |
| `sasottijotro-8363@yopmail.com` | (Root user) | 111 | Hard-coded in `TC-REG-111.spec.js` |
| Deal owner (currently `hilloummausimou-7060@yopmail.com`) | Mausimou technologies Pvt Ltd | 134, 146, 168, 203, owner in 217, and the API tests | `test-data/dealUser.json` |
| Data room requester (currently `youyejoufrola-9251@yopmail.com`) | Youyejoufrola Pvt Ltd | Requester in 217, API-001, API-007 and API-008 | `test-data/dataRoomRequester.json` |

To switch the deal tests to another account, edit the email and password in `test-data/dealUser.json`. The account must be onboarded, or it can't create deals. In TC-REG-217 the requester must belong to a **different organisation** from the owner; the test stops immediately if both files hold the same email.

### Files in `test-data/`

| File | Read or written | Purpose |
|---|---|---|
| `signupData.json` | Read by 001 | Fixed signup values: first/last name, password, org name, registration number, country. Email, org name, registration number and country are overridden with generated values. |
| `signupResults.json` | Written by 001; read by 033, 044, 074 | The last signup: email, password, organisation details, `status`. Later tests use the most recent entry with `status: "SUCCESS"`. |
| `dealUser.json` | Read by 134, 146, 168, 203, 217 and the API tests | Deal owner login. |
| `dataRoomRequester.json` | Read by 217 and the API tests | Data room requester login. |
| `kybData.json` | Read by 074, 168 and API-005 | What to enter in the company verification (Sumsub) widget: residence option, entity type, the document file for each document type, and the beneficiary's details. The beneficiary includes gender, tax residence and address, which only the club deal participant's form asks for. Also `participant`: the club deal participant's company name prefix, country (India) and registration number prefix, which a 6-digit stamp completes as a valid CIN. |
| `portfolioResults.json` | Written by 134 | Per asset group: draft name, submitted name, statuses seen in the UI, and the error if any. |
| `opportunityResults.json` | Written by 146 | Same, for opportunities. |
| `clubDealResults.json` | Written by 168 | Same, for club deals, plus the deal with a participant: its name and status, the participant company, Sumsub applicant ID and participant status. |
| `dueDiligenceResults.json` | Written by 203 | Per deal type and asset group: the deal due diligence was started on, or why it was skipped or failed. |
| `dataRoomRequestResults.json` | Written by 217 | Per asset group: the club deal whose data room was requested and approved, or why it was skipped or failed. |

The `dataroom/` folder holds sample PDF files. The deal tests (UI and API) upload two of them at random to each submitted deal's data room.

---

## 4. Test cases

### TC-REG-001: Sign up a new organisation

**File:** `tests/TC-REG-001.spec.js` · **Also covers:** TC-REG-014, TC-REG-021 · **Timeout:** 7 min, including up to 5 min waiting for the OTP · **Needs a person at the machine**

**Purpose:** a new user can create an account and organisation, and verify their email with a one-time code.

**Generated data:** a unique email (`user<timestamp><random>@yopmail.com`), an organisation name (for example "Summit Capital"), a registration number (`REG-<timestamp><random>`), and a random country from the signup form's list. Name and password come from `signupData.json`.

**Actions:**
1. Print the generated email in the terminal, and add it to the HTML report as a "signup email" annotation.
2. Open the home page and click **Create Account**.
3. Fill in Work email, First name, Last name, Password, Confirm password, Organisation legal name, and Organisation number or code.
4. Choose the country in the **Country** dropdown.
5. Click **Proceed**.
6. Print the email and its YOPmail inbox link (`https://yopmail.com/en/?login=<name>`) in the terminal, then **wait up to 5 minutes for you to enter the OTP**:
   - Open the inbox link, pass YOPmail's "Verify you are human" check, and copy the 6-digit code.
   - Type it into the six code boxes in the test's browser window. Click **Verify Email** if the form doesn't submit on its own.
7. When the success dialog appears, the test clicks **OK** itself.
8. Save the new account to `signupResults.json` and go to the login page.

**Checks:** the whole flow finishes without an error (status `SUCCESS`). If no code is entered within 5 minutes, the test fails, and the email is shown in the failure message.

**Output:** `test-data/signupResults.json`.

**Notes:**
- The browser always opens visibly for this test, even without `--headed`.
- Because it needs a person, leave this test out of unattended runs such as CI.
- The old automatic reader, `utils/otpReader.js`, is still in the repo but no longer used. YOPmail's "Verify you are human" check blocks it.

### TC-REG-033: Log in as the new user

**File:** `tests/TC-REG-033.spec.js` · **Depends on:** TC-REG-001

**Purpose:** a newly signed-up user can log in and reach their dashboard.

**Actions:**
1. Read the latest successful signup from `signupResults.json`.
2. Log in with its email and password. If the account belongs to more than one organisation, pick the first onboarded one on the organisation selector.
3. Wait for the redirect to the dashboard (`/itti`).

**Checks:** the user's email address is shown on the dashboard.

### TC-REG-044: New user's dashboard and organisation

**File:** `tests/TC-REG-044.spec.js` · **Also covers:** TC-REG-051, TC-REG-054 · **Depends on:** TC-REG-001

**Purpose:** a new, not-yet-onboarded user sees the right restrictions and options.

**Actions:**
1. Log in as the latest signed-up user and wait for the dashboard.
2. Dismiss the "Quick tour" prompt if it appears.
3. Go to the **Organisations** page.

**Checks:**
- The "Deals unlock once you're onboarded" banner is shown.
- Both **Self-Service Onboarding** and **Assisted Onboarding** are offered.
- On the Organisations page, the user has the **ROOT · READ-WRITE** role and the organisation is **NOT ONBOARDED**.

### TC-REG-074: Self-service onboarding (AUM details)

**File:** `tests/TC-REG-074.spec.js` · **Depends on:** TC-REG-001 (needs an account that hasn't entered AUM yet) · **Timeout:** 5 min

**Purpose:** a new user can enter their AUM range through the Itti chat assistant and submit it for verification.

**Actions:**
1. Log in as the latest signed-up user, dismiss the Quick tour, and check both onboarding options are shown.
2. Click **Self-Service Onboarding**.
3. Wait up to 45 seconds for the AUM form (Currency, AUM Lower Limit, AUM Upper Limit). Itti sometimes replies with text only, so if the form doesn't appear, send a positive reply in the chat and wait again. Up to four replies are tried, starting with "Yes, please proceed with self-service onboarding."
4. Enter **1M** as the lower limit and **10M** as the upper limit, choose **USD**, and click **Save**.
5. Send **"Confirm and Submit"** in the chat. If the verification prompt doesn't appear within 45 seconds, send "Yes, please confirm and submit my AUM details."

6. Click **Start Verification**. The app opens `/customer-onboarding` with Sumsub's company verification (KYB) widget, and the widget's start-up call (`websdkInit`) returns the organisation's **applicant ID**. The ID is printed in the terminal and added to the report.
7. Fill in the widget from `test-data/kybData.json`:
   - **Intro and residence:** click Continue, choose the country-of-residence option, and Continue.
   - **Company data:** click **Find company**, then **Enter company data manually** (a test company isn't in any registry). Check the company name matches signup, choose the **Type of entity** (Private company), and click **Save and continue**.
   - **Company documents:** upload a PDF for each required type (Incorporation certificate, Shareholder registry, Proof of address, Director registry), then Continue.
   - **Associated parties:** add one individual with roles UBO and Shareholder, reason "Owns 25% or more", 100% ownership, name, date of birth, email, phone and nationality, then **Create beneficiary**.
   - **Submit:** tick **Cannot be identified** for Trustee and click **Submit**. The widget shows "One last step", asking every associated party to verify their identity.
8. The beneficiary's own check (ID document and live selfie) can't be automated, so approve the company applicant through the Sumsub API: `POST https://api.sumsub.com/resources/applicants/{applicantId}/-/approve`.
9. Read the applicant back from Sumsub (`GET /resources/applicants/{applicantId}/one`) until its review result is **GREEN**, for up to 1 minute.

**Checks:**
- The AUM form appears.
- After saving, Itti shows "AUM Range: 1,000,000 – 10,000,000 USD" and the Save button is disabled.
- After confirming, **Start Verification** and **Remind me later** are both shown.
- The widget returns an applicant ID, every widget step completes, and "One last step" appears after Submit.
- The approve call succeeds and Sumsub reports the applicant's review as GREEN.

**Sumsub credentials:** the API calls are signed with a Sumsub sandbox App Token and Secret Key. Put them in a local `.env` file as `SUMSUB_APP_TOKEN` and `SUMSUB_SECRET_KEY`; `.env.example` shows the format, and `.env` is ignored by git. Without them, the test fails at the approve step with a message saying so.

**Notes:**
- Saving changes the account's onboarding record, and submitting the widget completes its verification. An account that has done either shows different screens, so this test needs a fresh signup each time.
- The test timeout is 10 minutes.

### TC-REG-111: Invite Normal and Admin users

**File:** `tests/TC-REG-111.spec.js` · **Account:** `sasottijotro-8363@yopmail.com` (hard-coded)

**Purpose:** a root user can add members to their organisation with different roles.

**Actions:**
1. Log in as the root user, dismiss the Quick tour, and open **Users**.
2. Click **Add User**, fill in First name "Normal", Last name "User", email `normal.user.<timestamp>@yopmail.com`, choose role **Normal**, and submit.
3. Repeat with "Admin", "User", `admin.user.<timestamp>@yopmail.com`, role **Admin**.

**Checks:**
- After each invite, "The member has been successfully added. Temporary credentials have been emailed to them." is shown.
- Both new email addresses appear in the users list.

---

### TC-REG-134: Create portfolios in every asset group

**File:** `tests/TC-REG-134.spec.js` · **Account:** `dealUser.json` · **Timeout:** 10 min

**Purpose:** a portfolio can be saved as a draft and fully submitted in each of the five asset groups, and each one shows up in that group's listing.

**For each asset group, in turn:**

*Portfolio 1: saved as a draft*
1. Open `/deals/portfolios/create/details?assetGroup=<group>`.
2. Enter a generated name such as "Summit Yield Portfolio 1793613757800".
3. Choose an **Asset Class**. The test waits until the dropdown lists exactly that group's asset classes (see [section 6](#6-app-behaviour-the-tests-work-around)), then picks one at random.
4. Pick a random **Sector**, **Nature of the Portfolio**, **Country**, and **State** and **City** where the country has them.
5. Click **Save as Draft**, check "Your portfolio has been saved as a draft.", and confirm the app saved it under the intended asset group.
6. Click **OK**.

*Portfolio 2: fully submitted*
1. Open the same create page and fill in the details the same way.
2. Click **Save & Continue**, check the page moves to the Documents step, and confirm the intended asset group again.
3. Reload the page (the data room sometimes gets stuck on "Loading data room…").
4. Upload two random PDFs from `dataroom/` and wait for both uploads to finish.
5. Click **Submit**, check the "Submit portfolio?" dialog, and click **OK**.
6. Check "Your portfolio has been submitted successfully." and click **OK**.

*Check in the UI*
1. Open the asset group's portfolio search, scoped to that group. Search each portfolio by name with **Include drafts** ticked. If a portfolio isn't found, the search is retried up to 3 times, 5 seconds apart.
2. The draft must be listed with status **Draft**.
3. The submitted portfolio must be listed with any status other than Draft. Right after submission it shows **Setting Up Data Room**.

**Final check:** all five asset groups are recorded as SUCCESS. If any isn't, the error names each failing group and the reason, for example `draft "…" not found in /deals/real-asset/portfolios`.

**Output:** `test-data/portfolioResults.json`.

**Notes:**
- One failing asset group doesn't stop the others; each is tried and reported.
- If a page hangs or a dropdown freezes, the whole create step is retried from a fresh page load, up to 3 times.

### TC-REG-146: Create opportunities in every asset group

**File:** `tests/TC-REG-146.spec.js` · **Account:** `dealUser.json` · **Timeout:** 10 min

The same flow as TC-REG-134, for opportunities:
- Create page: `/deals/opportunities/create/details?assetGroup=<group>`.
- Messages: "Your opportunity has been saved as a draft.", "Submit opportunity?", "Your opportunity has been submitted successfully."
- The UI check searches the group's opportunities listing.

**Output:** `test-data/opportunityResults.json`.

### TC-REG-168: Create club deals in every asset group

**File:** `tests/TC-REG-168.spec.js` · **Account:** `dealUser.json` · **Timeout:** 30 min · **Needs:** `SUMSUB_APP_TOKEN` and `SUMSUB_SECRET_KEY` in `.env`

The same overall flow as TC-REG-134, for club deals, but with **three** club deals per asset group (15 in all): a draft, a submitted deal without participants, and a submitted deal with a participant verified in Sumsub. The club deal form and steps differ:

**Deal details (all three deals):**
- Name such as "Pinnacle Frontier Club Deal 1793613804246".
- Asset Class (waiting for the group's own list, as above) and a random Sector.
- **Target investment amount:** a random whole number of millions from $5M to $99M.
- **Minimum ticket size:** a random multiple of $50,000 from $50,000 to $950,000.
- Random Country, State and City, and Nature of Deal.
- **Settlement Type:** Standard or Tokenized, at random.

**Draft:** click **Save as Draft** and check "Your deal has been saved as a draft."

**Submitted deal:**
1. Click **Save & Continue**. The page moves to the **People and Organisations** step, which portfolios and opportunities don't have.
2. Click **Skip & Continue**.
3. Upload two random PDFs, click **Submit**, check "Submit deal?", then "Your deal has been submitted successfully."

**Deal with a participant**, in every asset group. This takes about 1.5 minutes per group.

1. Create a club deal (same details as above) and click **Save & Continue**.
2. On **People and Organisations**, click **Add People and Organisations** and enter the participant from `kybData.json` → `participant`:
   - **Company Name:** "QA Participant Co <timestamp>".
   - **Country:** India.
   - **Registration No:** a valid Indian CIN, made from the prefix `U72900KA2015PTC` plus 6 digits. Sumsub checks the format for India.
   - Check that the participant is saved with status **KYB_PENDING** ("KYB Pending" on the page). Then click **Continue**.
3. Upload two PDFs, **Submit**, then **OK** on "Submit deal?".
4. "Would you like to verify the participant now?" → **Yes**. This opens the participant's Sumsub company verification at `/deals/launch-kyc`, and the test captures the applicant ID from `websdkInit`.
5. Fill the widget with the same steps and data as TC-REG-074. Differences in this flow:
   - There's no country-of-residence screen.
   - There's no "Type of entity" field.
   - The beneficiary also needs Gender, Tax residence country, Post code, City and State.
   - There's no Trustee role.
6. **Sumsub check:**
   - The applicant's `externalUserId` is the participant's ID and its company name matches.
   - Approve it through the API, then check that the review answer is **GREEN**.
7. **App check:** the participant is linked to that applicant (`complianceProviderId`) and its status is **KYB_SUBMITTED**. The test reads this by replaying the app's own participants call. The app keeps showing KYB_SUBMITTED after approval, because Sumsub still waits for the beneficiary's own identity check.

**UI check:** all three deals are searched in `/deals/<group>/club-deal`.
- The draft must have status Draft.
- Both submitted deals, with and without the participant, must have a status other than Draft.

**Result per asset group:** the group counts as SUCCESS only if all three deals were created and found, and the participant checks above passed. If one part fails, the others are still attempted, and the error names the part that failed.

**Output:** `test-data/clubDealResults.json`. Each entry has the draft and submitted names and statuses, plus:
- `participantDealName` and `participantDealStatus`.
- `participantCompany`, `participantApplicantId` and `participantKybStatus`.

When all 5 groups succeed, the log lists all 15 deals.

---

### TC-REG-203: Run due diligence on published deals

**File:** `tests/TC-REG-203.spec.js` · **Account:** `dealUser.json` · **Timeout:** 10 min

**Purpose:** due diligence can be started on a Published portfolio and a Published opportunity in each asset group.

**For portfolios, then opportunities, in each asset group:**
1. Open the group's search page and filter by status **Published**.
2. If nothing matches, record the group as **SKIPPED** and move on.
3. Otherwise open the first result's page.
4. Check the page heading matches the deal's name.
5. Check the deal doesn't belong to a *different* asset group. The breadcrumb, such as "Private Equity · Portfolio · Search Funds", must not name another group. Older deals created with a generic asset class show no group in the breadcrumb, for example "Portfolio · Special Situations"; these are accepted.
6. Click **Run Due Diligence**, check the "Run due diligence?" dialog appears, and click **Run due diligence**.
7. Wait up to 2 minutes for due diligence to show as started, reloading the page while waiting. Either the status shows **DD In Progress**, or the page shows "Due diligence is running".
8. Check **Run Due Diligence** is now disabled.

**Checks:** no asset group FAILED. Skipped groups are listed as annotations in the report but don't fail the test.

**Output:** `test-data/dueDiligenceResults.json`.

**Notes:**
- The test only checks that due diligence **started**. The run itself takes 10–15 minutes in the background, and the test doesn't wait for it.
- Each run uses up Published deals, because a deal with due diligence running is no longer Published. Run TC-REG-134 and TC-REG-146 about 15 minutes beforehand so there are fresh Published deals.
- See [Known issues](#7-known-issues-and-open-items): this test can currently pick another organisation's published deal.

### TC-REG-217: Request and approve club deal data rooms

**File:** `tests/TC-REG-217.spec.js` · **Accounts:** owner from `dealUser.json`, requester from `dataRoomRequester.json` · **Timeout:** 10 min

**Purpose:** a user from one organisation can request access to another organisation's club deal data room, and the owner can approve it.

**Setup:** both accounts log in, each in its own browser session, and stay logged in for the whole test.

**For each asset group, in turn:**

*Find a deal to request (owner)*
1. Open the group's club deal search, filter by **Published**, and scroll until every result has loaded.
2. Keep only the owner's own deals: those whose tile has an **Edit** button. This search also returns other organisations' published deals.
3. Take them one at a time and open the deal's page to get its link.

*Request access (requester)*
1. Open the same deal link and check the heading matches.
2. If **Request Data Room Access** isn't available, because it has already been requested or granted, try the owner's next deal.
3. Click **Request Data Room Access**. The request is sent straight away; there's no confirmation step.
4. Check "Your request to access the data room has been submitted.", click **OK**, and check the button changes to **Access Requested** and is disabled.

*Approve (owner)*
1. Open **Data Room Requests** → **Received**.
2. In the deal's row, which shows "Wants access", click **Approve**.
3. Check "Access request approved successfully." and click **OK**.
4. Check the row now shows **Can view**, with **View data room** and **Remove** buttons.

*Confirm (requester)*
1. Open **Data Room Requests** → **Sent**.
2. Check the deal's row shows **You can view**, with a **View data room** button.

If none of the owner's Published club deals in a group can still be requested, the group is recorded as **SKIPPED**.

**Checks:** no asset group FAILED.

**Output:** `test-data/dataRoomRequestResults.json`.

**Notes:**
- Each run uses up deals: once the requester has access to a deal, it can't be requested again. Run TC-REG-168 about 15 minutes beforehand to publish new club deals.
- The test doesn't remove access afterwards.

---

## 5. Page objects and helpers

### Page objects (`pages/`)

| File | Screen | Main actions |
|---|---|---|
| `signuppage.page.js` | Sign-up form | Open the form, fill it in, choose a country, proceed, wait for the email code to be entered by hand (or enter a given code) |
| `loginpage.page.js` | Login | Log in; picks the first onboarded organisation if the organisation selector appears |
| `dashboardpage.page.js` | Dashboard (`/itti`) | Wait for load, dismiss Quick tour, go to Users or Organisations; onboarding buttons and the "Deals unlock" banner |
| `organisationspage.page.js` | Organisations | ROOT role and NOT ONBOARDED badges |
| `userspage.page.js` | Users | Add a user with a role and check the success message |
| `onboardingchatpage.page.js` | Itti chat (onboarding) | Start self-service onboarding, nudge Itti until the AUM form appears, fill in and save AUM, confirm and submit |
| `dealformpage.page.js` | Deal create forms | Fill portfolio/opportunity or club deal details, choose the group's asset class, save draft, save and continue, skip participants or add a participant organisation and continue, upload files, submit, dismiss dialogs, confirm the saved asset group |
| `dealsearchpage.page.js` | Deal search (all three types) | Open the search scoped to an asset group, find a deal by name and read its status, find Published deals (or only the account's own), open a deal, check a draft/submitted pair or a single submitted deal |
| `dealviewpage.page.js` | A deal's own page | Run due diligence and confirm it started; request data room access |
| `dataroomrequestspage.page.js` | Data Room Requests | Switch between Received and Sent, approve a request, wait for a row's status |
| `kybverificationpage.page.js` | Company verification (Sumsub widget) | Confirm the AUM Details step if shown, accept the intro (and residence, if asked), get past the company search whichever way it goes, confirm company data, upload company documents with either type picker, add an individual beneficiary (with address fields if asked), and submit. Used for the organisation (074) and for club deal participants (168). |

### Helpers (`utils/`)

| File | Purpose |
|---|---|
| `dataGenerator.js` | Unique emails, organisation names, registration numbers, random country, deal names (`<Adjective> <Noun> <Type> <timestamp>`) |
| `countries.js` | Every country in the signup form's dropdown |
| `otpReader.js` | Opens YOPmail in a new tab and reads the 6-digit code from the latest email. No longer used, because YOPmail's "Verify you are human" check blocks it. |
| `jsonWriter.js` | Writes the signup result to `signupResults.json` |
| `dealForm.js` | Picks random PDFs from `dataroom/` |
| `sumsubApi.js` | Signed calls to the Sumsub API: approve an applicant, read an applicant's review status. Needs `SUMSUB_APP_TOKEN` and `SUMSUB_SECRET_KEY` in `.env`. |
| `dealResults.js` | Records each asset group's deal result, merges them into the results file, fails with the list of groups that didn't succeed, and logs every created deal once all groups succeed |

---

## 6. App behaviour the tests work around

| Behaviour | Effect | How the tests handle it |
|---|---|---|
| For a second or two after the deal form loads, **Asset Class** lists generic or all classes before narrowing to the page's asset group. | The app files a deal under the group its asset class belongs to, so a class picked from the early list can put the deal in the wrong group. | Wait until the options exactly match the group's classes, then pick one. Afterwards, check the group the app saved. |
| Clicking a listing's **Search** button before the page finishes loading opens a search across **all** asset groups. | A deal could appear to be in the right group when it isn't. | Open the search page directly with the asset group in the URL. |
| The **Published** search returns other organisations' published deals as well as your own. | A test could act on someone else's deal. | TC-REG-217 keeps only tiles with an Edit button. TC-REG-203 doesn't yet; see [below](#7-known-issues-and-open-items). |
| A deal's page refreshes itself only every 60 seconds, and its status can say "Published" while due diligence is already running. | A due diligence check could miss a run that has started. | Reload while waiting, and accept either "DD In Progress" or "Due diligence is running". |
| Itti's chat replies vary: sometimes the AUM form, sometimes text only. | The onboarding form may not appear on the first reply. | Send positive replies until it appears. |
| The deal data room can get stuck on "Loading data room…" after saving. | Files can't be uploaded. | Reload the page before uploading. |
| **Request data room access** sends immediately, and a sent request can't be withdrawn. | A mistaken click can't be undone. | Only request the owner's own deals, from the deal's page. |
| Submitted deals take about 15 minutes to reach **Published** (data room setup, then publishing). | Tests that need Published deals find none straight after creating them. | Groups with nothing to use are SKIPPED, not FAILED. |

## 7. Known issues and open items

1. **Signup (TC-REG-001) needs the OTP entered by hand.** YOPmail shows a Cloudflare "Verify you are human" check before opening an email, so the code can't be read automatically. The test now waits for a person to type it in, so the new-user chain can't run unattended. Options for automating it again:
   - a test-environment OTP bypass from the developers,
   - an inbox service with an API (for example MailSlurp).
2. **TC-REG-203 can run due diligence on another organisation's deal.** It takes the first Published result, and that search includes other organisations' deals. On 10 November most of the deals it chose belonged to Youyejoufrola Pvt Ltd rather than the deal account's organisation. Using the same "own deals only" filter as TC-REG-217 would fix this.
3. **A data room request that couldn't be withdrawn.** While building TC-REG-217, a request was sent from `youyejoufrola-9251` for "QA E2E PE BUYOUT 1106", a deal owned by neither test account. It is waiting for that deal's owner to approve or reject it.
4. **Accounts are shared.** Two runs using the same account at the same time interfere with each other. Agree with anyone else running the suite before starting a deal-chain run.
5. **TC-REG-001 records the username as `undefined_<timestamp>`.** `signupData.json` has no `username` field. This is only used for logging and the results file.
6. **`npm run regression` doesn't include TC-REG-203 or TC-REG-217.**
7. **Older deals with generic asset classes.** Deals created before the asset-class fix (around 2 November) have classes like "Special Situations" that belong to no group's list. Their pages show no asset group in the breadcrumb.

---

## 8. API tests (`api-tests/`)

The same features as the UI suite, tested by calling the backend directly, with no browser. They run as their own Playwright project, `api`. Specs are named `*.api.spec.js`.

**Run:** `npm run api`, or one file with `npx playwright test --project=api api-tests/API-005-club-deals.api.spec.js`.

**Environment:** SIT by default. `ITTI_ENV=dev npm run api` calls dev instead (its API, redirect address and Cognito app client). The accounts in `test-data/` are SIT accounts, so for dev set `DEAL_USER_EMAIL`/`DEAL_USER_PASSWORD` (and the `DATA_ROOM_REQUESTER_*` pair) in `.env` or the environment. See `.env.example`.

**Needs:**
- The accounts in `test-data/dealUser.json` and `test-data/dataRoomRequester.json`.
- `SUMSUB_APP_TOKEN` and `SUMSUB_SECRET_KEY` in `.env` for the participant tests in API-005.

**Not covered:**
- Signup, because the emailed code can't be read automatically.
- The AUM onboarding step, because it's driven by the Itti chat, not by an endpoint.

These stay UI-only (TC-REG-001 and TC-REG-074).

### How the tests log in

`api-tests/helpers/apiClient.js` signs in the same way the dashboard does:
1. A Cognito password login (`USER_PASSWORD_AUTH`) returns an ID token and an access token. The username is the SHA-256 of the lowercased email, as the app's own sign-in sends it; logging in with the email itself only works where the email is verified.
2. `GET /app-metadata` is called with `session-token` set to base64 of `{"id_token", "access_token"}`. It returns the session token (the access token) and the user's organisations. Unless a test asks for a specific organisation, the first APPROVED (onboarded) one is used: a user can also belong to draft organisations, which may only read deals.
3. `POST /preferences/login` is called with `{org_ref_id}`. Until this step, every call is refused with 403.
4. Every later call sends two headers: `session-token: <access token>` and `redirect-uri: https://sit-ireland-dashboard.ittikar.com/auth`. The token lasts 3 hours.

**Writes:** every POST and PATCH needs a new `x-idempotency-key` header. Without it the backend returns 400 `VALIDATION_ERROR`. The client adds one automatically.

**Documents** are stored in a separate document service (`mondevo-connect.dms.ittikar.com`). `GET …/<id>/session` gives a token for that deal's data room, plus the groups allowed to read and own its files. Uploading one file takes three calls:
1. Create a dossier in a data room category folder.
2. Upload the content (`x-s3-config-id: ireland`, so the file goes to the Ireland bucket).
3. File a "sheet" that links the two.

All of this is in `helpers/dataRoom.js`.

### Files

| File | Scenarios |
|---|---|
| `API-001-auth` | Both accounts log in and read their profile (onboarded organisation, root/admin role). Refused cases: a wrong password, no session token, a made-up token, and a write without an idempotency key. |
| `API-002-reference-data` | Each module (portfolio, opportunity, club deal) lists all 5 asset groups, each with its own unique asset classes, plus sectors and nature of deal. Also club deal settlement types and statuses, portfolio and opportunity statuses, organisation types and onboarding statuses, and the product hierarchy. |
| `API-003-portfolios` | In every asset group: a draft is saved in the right group and listed as DRAFT. A second deal is created, its data room opened, 2 PDFs uploaded and listed, marked submittable, and submitted (SUBMITTED, then listed with a non-draft status). Submitting before the data room is opened is refused (422). |
| `API-004-opportunities` | The same as API-003, for opportunities. |
| `API-005-club-deals` | In every asset group there are three deals. **Draft.** **Submitted without participants.** **Submitted with a participant:** the participant is added as KYB_PENDING, and launching its KYB before submitting is refused (422). After submitting, `launch-kyc` creates the Sumsub company applicant, the app links the participant to it, and the test approves it in Sumsub (GREEN). The app then shows **KYB_PROVIDER_APPROVED**. Also: a participant without a company name or registration number is refused. |
| `API-006-due-diligence` | For portfolios and opportunities in every asset group: take one of the deal user's own Published deals that can run due diligence, and start it (`DD_RUN_STARTED`). The deal then reports `DD_IN_PROGRESS` with the active run, the timeline shows DD started, and a second start is refused (409). On a draft, due diligence is blocked (`NOT_PUBLISHED`, 404). |
| `API-007-dataroom-requests` | In every asset group: the requester asks to see one of the deal user's Published club deals that it hasn't requested before (PENDING). A second request for the same deal is refused. The owner sees the request in Received and approves it, and both sides then see it APPROVED. |
| `API-008-organisation-and-listings` | Both organisations list their user as an active member. The own-deal listings work for club deals, portfolios and opportunities, as do other organisations' deals and the asset class stats. For a Published club deal: its details, its status timeline from DRAFT to PUBLISHED, and that the requester can view it but can't submit it. |

**Helpers** in `api-tests/helpers/`:
- `apiClient.js`: login and the session.
- `dataRoom.js`: opening the data room, uploading and listing documents.
- `deals.js`: create payloads from the reference data, creating drafts, submitting, and searching the user's own deals.
- `dealLifecycleTests.js`: the shared portfolio and opportunity scenarios.
- `testData.js`: the accounts and data files.

### Things to know

- **Deal names start with "API"**, e.g. "API PORTFOLIO 1794896382128872", so these deals can be told apart from the UI tests' deals. The backend stores names in capitals.
- **Each run creates deals on SIT:**
  - 10 portfolios, 10 opportunities and 15 club deals, plus a few drafts from the negative tests.
  - 5 Sumsub applicants.
  - Data room requests for 5 Published club deals, which can't be undone.
- **Running due diligence and data room requests uses up deals.** API-006 and API-007 need deals that were submitted about 15 minutes earlier and are now Published. If a group has none left, its test fails and names what was missing. Running TC-REG-168 or API-005 creates new ones.
- **A participant reaches a different status than in the UI.** Approving through the API gives KYB_PROVIDER_APPROVED. In the UI flow, filling the widget leaves it at KYB_SUBMITTED, because Sumsub then waits for the beneficiary's own ID and selfie check.

