# AGENTS.md

## Project Overview

This project is a web tool for recording visited Japanese municipalities.
It displays a blank map divided by municipality. When a user clicks a municipality, it is marked as visited and filled with a color. The visited municipalities and their colors are stored in the browser so the state is restored after reopening the page.

The expected deployment target is Cloudflare Pages.

## Product Requirements

- Show a nationwide Japan municipality map.
- Support pan and zoom on the map.
- Render unvisited municipalities with a white fill and subtle gray borders.
- Treat Tokyo's 23 special wards as individual units, but aggregate designated city wards into their parent city.
- Toggle a municipality to visited when clicked.
- Automatically assign a fill color when a municipality is marked visited.
- Choose automatic colors so nearby visited municipalities are visually distinct, especially by hue.
- Allow the user to manually adjust the color of each visited municipality later.
- Store visited municipality state and color in `localStorage`.
- Restore saved state when the page is reopened.
- Show basic progress information such as visited count, total municipality count, and visited percentage.
- Provide municipality search and zoom to the matching municipality.

## Technical Direction

- Frontend: Vite + React + TypeScript.
- Map rendering: MapLibre GL JS.
- Geometry utilities: Turf.js.
- Data preprocessing: Node.js script.
- Styling: CSS Modules or plain CSS.
- Browser persistence: `localStorage`.
- Deployment: Cloudflare Pages.
- Testing: Vitest + React Testing Library; use Playwright when end-to-end map behavior needs verification.

## Map Data

- Use the Japanese Ministry of Land, Infrastructure, Transport and Tourism National Land Numerical Information administrative area dataset (`N03`) as the source.
- Source page: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html
- As of 2026-06-18, the latest data listed on that page should be treated as the January 1, 2023 administrative area data.
- Do not ship the original large source dataset to production.
- Preprocess the data before build into lightweight GeoJSON suitable for browser delivery.
- Reconstruct municipality geometry as a fixed-size equilateral triangle grid during preprocessing. This intentionally favors clean, matching boundaries and pleasant fill behavior over precise administrative shapes.
- Use a 3000 meter triangle side length and 50% land coverage threshold by default.
- Exclude unassigned or owner-unclear reclaimed lands, such as `所属未定地`, `荒川河口部`, `中央防波堤外側廃棄物処理場`, `名古屋港口埋立地`, and `境界部地先の埋立地`.
- Aggregate designated city wards into city-level features. Tokyo's 23 special wards must remain ward-level features.
- Keep only the attributes needed by the app:
  - `municipalityCode`
  - `prefectureName`
  - `municipalityName`
  - `displayName`
- Use the administrative area code (`N03_007`) as the stable municipality key.
- For aggregated designated cities, use a deterministic app-level municipality key rather than ward-level `N03_007` codes.
- Remove unnecessary attributes and split files if needed so nationwide loading remains practical.
- Prefer a Cloudflare-friendly static data layout:
  - generated triangle-grid GeoJSON assets;
  - compressed static delivery;
  - lazy loading by prefecture or region if a nationwide single file is too large.

## Map Rendering

- Use MapLibre GL JS for pan and zoom, but render this as a blank thematic map rather than a normal street map.
- Do not require a third-party basemap service for the initial release.
- Use a simple solid background and render the municipality polygons as the primary visible layer.
- Keep unvisited areas white and visited areas colored.
- Use MapLibre only for viewport interaction, hit testing, and polygon rendering.

## Adjacency Data

- Do not calculate municipality proximity for color selection in the browser at runtime.
- Generate a color-conflict proximity graph during preprocessing from nearby triangle cells.
- Store the proximity graph as a static JSON asset keyed by the same municipality keys used in saved state.
- The browser should only look up nearby municipality keys from the precomputed graph when choosing colors.
- Proximity for aggregated designated cities must be calculated after aggregation so city-level units behave correctly.

## Persistence Contract

Use this `localStorage` key:

```text
visitedMunicipalityMap:v1
```

Use this saved state shape:

```ts
type SavedState = {
  version: 1;
  updatedAt: string;
  municipalities: Record<string, {
    visited: true;
    color: string;
  }>;
};
```

`municipalities` keys must be the app-level `municipalityCode` values used by the processed map data. These are usually `N03_007` values, except for aggregated designated cities.

When restoring state:

- Treat missing state as an empty map.
- Ignore invalid JSON without breaking the UI.
- Ignore municipality codes not present in the current map data for rendering.
- Preserve user-selected colors as-is.

## Color Selection

- Generate automatic colors in HSL space.
- Prefer colors whose hue differs sufficiently from nearby visited municipalities.
- Use the precomputed proximity graph to compare against already visited nearby municipalities.
- If hue-only choices are insufficient, vary saturation and lightness while keeping colors readable.
- Manual color changes override automatic color selection for that municipality.

## Cloudflare Pages Deployment

- Build command: `npm run build`.
- Output directory: `dist`.
- Configure SPA fallback with a `_redirects` file:

```text
/* /index.html 200
```

- The first release does not require Cloudflare Workers, D1, KV, accounts, login, or cloud sync.
- Only preprocessed static assets should be deployed.
- Keep source GIS downloads and intermediate conversion artifacts out of the production bundle.

## Testing Expectations

Implement tests for:

- Clicking a municipality marks it visited.
- Visited color is persisted.
- Reloading restores visited municipalities and colors.
- Unmarking a municipality removes it from saved state.
- Manual color changes update saved state.
- Automatic colors avoid close hues among nearby visited municipalities.
- The precomputed proximity graph is used for color selection instead of runtime polygon intersection.
- Search zooms to the selected municipality.
- Empty, malformed, or unsupported `localStorage` state does not break the app.
- Static SPA routing works under Cloudflare Pages style fallback.

## Initial Scope

The initial release should support:

- Nationwide map.
- Pan and zoom.
- Triangle-grid municipality boundary shapes with cleanly matching borders.
- Municipality click-to-visit behavior.
- Automatic distinct coloring.
- Per-municipality color adjustment.
- Local-only browser persistence.
- Cloudflare Pages static deployment.

The initial release should not include:

- Backend API.
- User accounts.
- Cloud synchronization.
- Share URLs.
- Automatic migration for municipality mergers or code changes.
- Ward-level tracking for designated cities other than Tokyo's 23 special wards.
