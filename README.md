# Run the app

Install Node.js 20 or newer, then run these commands from the project root folder:
```powershell
npm install
npm start
```

The server reads its settings from the ignored `.env` file and listens on port 8000 by default. It binds to `0.0.0.0` so devices on the same network can access it. On the computer running the server, use `ipconfig` to find its IPv4 address. Open `http://<IPv4-address>:8000/` for the customer catalog or `http://<IPv4-address>:8000/admin` for the admin panel. If Windows Firewall prompts, allow access on private networks.

`firebase.json` is only a static Hosting configuration; it does not route requests to this Express server. The app's configuration and protected admin/upload APIs require Express, so deploy the Express app behind HTTPS rather than deploying this project as static Hosting alone. Static Hosting is configured to exclude service-account JSON filenames.

## Free Render deployment
1. Push the project to a private GitHub repository. The service-account JSON file and `.env` are ignored; never force-add them.
2. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml`, installs production dependencies with `npm ci`, starts the Express server, and checks `/healthz`.
3. In the Render service's Environment settings, enter the Firebase web settings, admin UID values, Cloudinary values, and the complete service-account JSON as the value of `FIREBASE_SERVICE_ACCOUNT_JSON`. Paste valid JSON only into Render's secret environment field; do not add it to source files or commit history.
4. Set the Firebase Authentication authorized domain to the deployed `*.onrender.com` hostname, then deploy the Firestore rules with `firebase deploy --only firestore:rules`.
5. Free web services can sleep while idle and cold-start on the next request; availability, memory, CPU, and bandwidth depend on the provider's current free-tier limits. Fifty visitors opening a normal, lightweight catalog should be modest because catalog reads and image delivery are handled by Firebase and Cloudinary, but this is not a 50-concurrent-user capacity guarantee. Load-test the deployed instance before relying on it during peak traffic.


# Business Catalog & Ordering Starter

Starter structure for a Firebase-powered customer catalog and ordering system. Adapt it for cafes, restaurants, hotels, shops, and other service businesses.

## Main areas
- Customer catalog
- Manager/Admin panel
- Categories and groups
- Products, packages, and services
- Tables, rooms, and QR codes
- Orders
- WhatsApp settings
- Business settings

## Environment setup
1. Create a Firebase project.
2. Enable Firebase Authentication and Firestore.
3. Copy `.env.example` to `.env` and fill in the Firebase web configuration values. The existing local `.env` is prefilled with this project's Firebase web configuration.
4. For server-side Firebase token verification and account management, install Firebase Admin credentials on the server and set `GOOGLE_APPLICATION_CREDENTIALS` to the service-account JSON file path. Do not put that JSON file inside a public or committed folder. Set the primary account UID in `FIREBASE_PRIMARY_ADMIN_UID`; add its UID to `FIREBASE_ADMIN_UIDS` as well. The primary account can add admins, set their passwords, and remove non-primary admins from Admin Accounts.
5. Deploy the included Firestore rules with `firebase deploy --only firestore:rules`. Public visitors can read catalog/site settings; only users with the server-issued `admin` custom claim can modify them. The primary admin receives this claim on its first successful admin access check. The Firebase web API key is public client configuration, not a security boundary.

## Cloudinary image uploads
- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server's `.env` file. The API secret stays on the server and is never sent to the browser. Do not add it to frontend JavaScript or share it in source control.
- The server signs each image upload request after verifying the user's Firebase ID token and checking that the user is an admin. The image bytes upload directly to Cloudinary using that short-lived signed request; the API secret never reaches the browser, and no Firebase Hosting deployment is needed when the Express server is used.
- When an admin removes a Cloudinary image while editing or deleting an item, the browser asks the authenticated Express API to delete it. The server checks the admin token, restricts deletion to the configured catalog folder, and signs the Cloudinary destroy request with the server-side API secret.
- Uploads preserve the original file without browser-side JPEG recompression. Cloudinary serves responsive 1:1 card/cart crops and quality-optimized detail images constrained to the gallery's 4:3 area; original images remain available to fit the gallery without distortion.
- Catalog item metadata and image URLs are stored in Firestore; image files are stored in Cloudinary. Removing an image from an item also requests deletion of its Cloudinary asset through the authenticated backend.
- Admin passwords are never retrievable or displayed. Use the Admin Accounts page to set a new password. These management features require valid Firebase Admin credentials on the server.
- In Admin → Tables, select whether checkout asks for a table or room number and set the total from 1 to 20. Customer checkout accepts only whole numbers from 1 through the configured total.

The `.env` file is excluded by `.gitignore`. Keep production environment values and Firebase Admin credentials in your hosting provider's secret/environment configuration. Deploy the Express server behind HTTPS in production; do not expose the Cloudinary signing API over public plain HTTP.

## Faster repeat visits and offline cache
- The app enables Firestore multi-tab IndexedDB persistence so previously loaded catalog data can display quickly and remain available offline in supported browsers. If the browser cannot initialize persistent storage, the app logs the issue and falls back to Firestore's memory cache. The browser may ask the user to clear site data to free persistent storage.
- A same-origin service worker caches the app shell and static assets and keeps the public Firebase client config available for repeat visits. Firebase/Cloudinary secrets and authenticated upload requests are never cached.
- Cookies are not used for image/database caching: they are sent with requests and are not suited to storing catalog records or image files. Cloudinary CDN transformations cache optimized image variants close to visitors.

## Faster first visit
- Firebase web configuration is returned directly as a JavaScript module by Express, removing a separate configuration fetch from the Firebase startup chain.
- Google Fonts load asynchronously so they do not block first paint. The catalog prioritizes its first visible image and lazy-loads images further down the list.
- Express compresses larger HTML, CSS, JavaScript, and JSON responses with gzip/Brotli negotiation to reduce the amount transferred on a cold visit.
