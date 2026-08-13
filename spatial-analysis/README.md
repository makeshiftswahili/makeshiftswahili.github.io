# Spatial Analysis Labs

Static GitHub Pages teaching tools for a graduate spatial analysis course.

## Architecture

- `index.html`: landing page.
- `styles.css`: shared visual system, aligned with the Communities & Crime course site.
- `assets/core.js`: reusable geography, weights, spatial-statistics, simulation, and matrix utilities.
- `assets/labs.js`: lab-specific UI and interactions.
- Individual lab routes: `weights/`, `lag/`, `moran/`, `lisa/`, `maup/`, `regression/`.

Real-geography labs reuse city polygon files already stored at `/communities-crime/data/` for New Orleans, Houston, Atlanta, Chicago, and Los Angeles. Their teaching values are synthetic and explicitly labeled as such. Synthetic grids are used where the data-generating process needs to be controlled.

The site is backend-free. No Supabase account or API key is required for this first batch.
