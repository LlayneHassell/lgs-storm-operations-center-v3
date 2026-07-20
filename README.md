# LGS Storm Operations Center v3

This is the modular GitHub Pages version of the approved Storm Operations Center v2. The visual behavior and automation are preserved, but the HTML, CSS, and JavaScript are now separated so future changes are safer.

## Folder structure

```text
index.html
css/dashboard.css
js/app.js
docs/DATA-SOURCES.md
```

## Publish on GitHub Pages

1. Extract this folder.
2. Upload **the contents of the folder** to the root of the GitHub repository.
3. Confirm the repository root contains `index.html`, `css`, `js`, and `docs`.
4. Commit the changes.
5. In **Settings → Pages**, publish from the main branch and root folder.

Do not upload the outer ZIP as the website. GitHub Pages needs the extracted files.

## Automatic updates preserved

- NOAA weather alerts refresh every 5 minutes.
- NHC cones, tracks, and forecast points refresh every 5 minutes.
- Contract and subcontractor Google Sheet feeds refresh every 2 minutes.
- Cone-impact calculations, timeline data, and generated briefs update from the refreshed data.

## Safe editing rule

Keep `index.html` focused on page structure, `css/dashboard.css` on appearance, and `js/app.js` on data loading and behavior. Before larger future refactors, make one change at a time and test both desktop and mobile.

## Sprint 1.3 contrast correction
This release fixes nested white cards, dark-on-dark storm names, pale purple impact badges, and the white Map Intelligence header/body. The stylesheet and script references include a version query so browsers fetch the corrected files rather than cached copies.
