# PO2 Proxy Explorer on GitHub Pages

The complete static PO2 dashboard, with border-defined proxy groups, a core map,
age/depth plots, and observation downloads. No build service or database is needed.
Map libraries, chart libraries and coastline data are included locally. The data
snapshot is stored as UTF-8 parts listed in `data.json`; the loader restores the
original snapshot before displaying any records.

The previous EW0408-85JC page is preserved at `site-inspector/`.

## Hosting

Publish the repository's `main` branch from `/(root)` in Settings → Pages.
The `camappel.github.io` account currently redirects Pages URLs to `appel.co.uk`,
so the expected project address is https://appel.co.uk/PO2_PAGES/ after Pages is enabled.
This folder does not change the account's existing custom-domain settings.

## Updating

Authoritative dashboard sources remain in the sibling `po2-dashboard` project.
After rebuilding its data, run from the parent PO2_PAGES folder:

```sh
python3 po2-dashboard/scripts/export_github_pages.py
```

Inspect and publish the changes in this repository separately. The exporter does
not push to GitHub, alter sharing, or enable Pages.

The older `export_site_page.py` helper is for the original single-core page only.
If refreshing that view, explicitly target `github-pages/site-inspector/site-data.json`.

## Scientific status

Values retain their source units, references and workbook rows. Age models,
proxy interpretation, core identities and missing coordinates remain subject to
review. Original Excel workbooks and internal contributor fields are not included.
No new licence is applied to third-party observations.
