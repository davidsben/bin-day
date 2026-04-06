# bin-day

Static bin-day page generator for Derby City Council addresses. It fetches a Derby bin-day results page, finds the next collection date, and generates a simple page you can embed in DAKboard.

## How it works

1. Set `BINDAY_URL` to a Derby bin-day details URL.
2. Run `npm run generate`.
3. The script writes:
   - `docs/current.json`
   - `docs/index.html`

`docs/index.html` is the file to publish with GitHub Pages or any static host.

## Local usage

```bash
cd bin-day
export BINDAY_URL='https://secure.derby.gov.uk/binday/BinDays/100030350384?address=117%20Radbourne%20Street,%20Derby,%20DE22%203BW'
npm run generate
```

Then open `docs/index.html` in a browser, or publish the `docs/` directory.

## GitHub setup

1. Push this project to GitHub.
2. Add a repository secret named `BINDAY_URL`.
3. Enable GitHub Pages and publish from the `docs/` folder on the default branch.
4. The included workflow refreshes the output twice per day.

If you want a different refresh cadence, edit `.github/workflows/update.yml`.

## DAKboard

In DAKboard, add a `Website/iframe` block and point it at your published `docs/index.html` URL.
