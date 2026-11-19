# Signing and notarizing the macOS app

Without this, macOS shows *"Apple could not verify AGASTHY is free of malware"* the first time someone opens a downloaded copy. With a Developer ID and notarization, the app, the DMG and the command-line tool open with no prompt at all, including installs through Homebrew. The release workflow already does the signing; it only needs six repository secrets.

Cost: the [Apple Developer Program](https://developer.apple.com/programs/), US$99 a year. Enrolment as an individual usually takes a day or two.

## 1. Enrol

1. Go to https://developer.apple.com/programs/enroll/ and sign in with your Apple Account (two-factor authentication must be on).
2. Enrol as an **Individual** (your legal name is shown as the publisher) or as an **Organization** (needs a D-U-N-S number; the company name is shown).
3. Wait for the confirmation email.

## 2. Create a Developer ID certificate (on your Mac)

1. Open **Xcode → Settings → Accounts**, add your Apple Account, select the team, click **Manage Certificates…**, then **+ → Developer ID Application**.
   Without Xcode: **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority** (save to disk), then upload it at https://developer.apple.com/account/resources/certificates/add, type **Developer ID Application**, and double-click the downloaded `.cer`.
2. Check it is there and copy its full name:
   ```sh
   security find-identity -v -p codesigning
   # 1) ABCDEF… "Developer ID Application: Your Name (TEAMID1234)"
   ```
   The part in quotes is the **signing identity**; the ten characters in brackets are the **Team ID**.
3. Export it with its private key: in **Keychain Access → login → My Certificates**, right-click *Developer ID Application: …* → **Export…** → save as `agasthy-developer-id.p12` and choose a strong password.

## 3. Create an app-specific password

At https://account.apple.com → **Sign-In and Security → App-Specific Passwords**, create one named `AGASTHY notarization`. It looks like `abcd-efgh-ijkl-mnop`. This is what notarization uses; never use your real Apple password.

## 4. Add the six secrets

From the repository folder (each command asks for the value, so it does not end up in your shell history):

```sh
base64 -i agasthy-developer-id.p12 | gh secret set APPLE_CERTIFICATE -R HMAKT99/Agasthy
gh secret set APPLE_CERTIFICATE_PASSWORD -R HMAKT99/Agasthy   # the .p12 export password
gh secret set APPLE_SIGNING_IDENTITY -R HMAKT99/Agasthy       # Developer ID Application: Your Name (TEAMID1234)
gh secret set APPLE_ID -R HMAKT99/Agasthy                     # the Apple Account email
gh secret set APPLE_PASSWORD -R HMAKT99/Agasthy               # the app-specific password
gh secret set APPLE_TEAM_ID -R HMAKT99/Agasthy                # TEAMID1234
```

Then delete `agasthy-developer-id.p12` (it stays in your keychain) and keep a backup of it in a password manager.

## 5. Release

The next tag builds a signed, notarized app. The release job fails rather than publishing something that only looks signed: it checks the app with `codesign`, asks Gatekeeper (`spctl`) for *"source=Notarized Developer ID"* on the app and the DMG, and validates the stapled ticket. The command-line tool is signed and notarized too.

To check a published download yourself:

```sh
spctl --assess --type execute -vv /Applications/AGASTHY.app
# /Applications/AGASTHY.app: accepted
# source=Notarized Developer ID
```

Once that works, the "expect one security prompt" notes can come out of the README and the release notes.

## Renewal

The Developer ID certificate is valid for five years; the programme membership renews yearly. If the membership lapses, already-notarized releases keep opening, but new releases cannot be notarized.
