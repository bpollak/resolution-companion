# Social preview cards

The five website routes use distinct 1200 × 630 PNG cards styled with the website's blue-gray hero palette, teal headings, outlined app icon, and actual Plan screen. Open Graph and Twitter metadata include page-specific titles, descriptions, and image alternatives.

Regenerate with `node scripts/render-social-cards.mjs` using a Playwright runtime and Chrome. The script uses local app assets, checks layout bounds, writes image filenames containing a content hash, and updates the five HTML templates. Set `NODE_PATH` if Playwright is supplied by an external tool runtime. Review every rendered image before publishing. The committed PNGs are served directly; deployment does not need Playwright.

Keep previously published card files available for existing links. New filenames avoid reusing stale image URLs, although social platforms may continue to cache the page metadata until they fetch it again.
