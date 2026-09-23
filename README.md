# Fika Price Finder: live test version

Search a product, choose a country, and compare live prices from Google Shopping
(via SerpApi), converted to that country's currency, with an optional import-tax estimate.

## What's inside

- `index.html`: the app people use
- `api/search.js`: the small server that fetches live prices (keeps your key secret)
- `api/_lib.js`: currency detection and conversion
- `package.json`: settings for the hosting service

## Put it online (about 15 minutes, no coding)

1. **Get a search key.** Sign up at serpapi.com (free plan: 250 searches a month).
   Copy your API key from the dashboard.
2. **Upload the files to GitHub.** Create a free account at github.com. Click
   **New repository**, name it `fika-price-finder`, then **Create**. Click
   **uploading an existing file** and drag in everything from this folder,
   including the `api` folder. Click **Commit changes**.
3. **Deploy on Vercel.** Sign up at vercel.com using your GitHub account. Click
   **Add New → Project**, pick `fika-price-finder`, and click **Import**.
4. **Add the key.** Before deploying, open **Environment Variables**. Set the name to
   `SERPAPI_KEY` and paste your key as the value. Click **Deploy**.
5. **Test.** Vercel gives you a web address, for example `fika-price-finder.vercel.app`.
   Open it on your phone and search.

## Good to know

- Each new search uses 1 of your 250 monthly searches. Repeating the same search
  within an hour is served from cache and costs nothing.
- Google Shopping coverage is thin in some countries, including Tanzania. If you get
  few results, try a common product name or compare with Kenya or South Africa.
- Items priced in a foreign currency are treated as likely imports, and the tax
  estimate is added to them. Edit duty and VAT on the page.
- Vercel's free plan is for personal, non-commercial use. It's fine for testing.
  Move to a paid plan before earning money from the app.
