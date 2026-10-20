# PO2 Proxy Explorer: 64PE406-E1

A public preview limited to **64PE406-E1** and its three linked studies:

- Hennekam et al. (2020), https://doi.org/10.1029/2020GL089183
- Rush et al. (2019), https://doi.org/10.5194/bg-16-2467-2019
- van Kemenade et al. (2023), https://doi.org/10.1016/j.gca.2023.06.018

Select a border-defined proxy group, locate the core on the map and plot its
measurements against age or sample depth. Downloads contain only this core.
Location evidence: https://doi.pangaea.de/10.1594/PANGAEA.923191

No original Excel files, internal contributor fields or other cores are included.
The complete dashboard remains separate. Data retain source units, workbook
rows and references; age models and proxy interpretation remain subject to review.
No new licence is applied to third-party observations.

## Hosting and updating

This is a static site. Publish main from /(root) in GitHub Settings → Pages.
The account's existing custom domain gives https://appel.co.uk/PO2_PAGES/.
All scripts, libraries and coastline assets are local. data.json lists UTF-8
snapshot parts, which are joined before any data are displayed.

The private project's scripts/export_github_pages.py exports this explicit
core and study allowlist. Changing publication scope requires explicit approval.
The exporter itself does not push or enable hosting.
