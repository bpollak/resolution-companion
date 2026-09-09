# Social preview cards

The homepage uses the approved 1731 × 909 premium card, `social-home-premium-28c6b8ea576a.png`, with bold white and cyan type, an angled phone, and dimensional teal lighting. This image was created with the built-in image-generation tool using the original app icon and Plan screenshot as references. The four supporting routes retain their 1200 × 630 blue-gray cards. Open Graph and Twitter metadata include page-specific titles, descriptions, and image alternatives.

Regenerate the four supporting cards with `node scripts/render-social-cards.mjs` using a Playwright runtime and Chrome. The script uses local app assets, checks layout bounds, writes image filenames containing a content hash, and updates the four supporting HTML templates. Set `NODE_PATH` if Playwright is supplied by an external tool runtime. Review every rendered image before publishing. The committed PNGs are served directly; deployment does not need Playwright.

Keep previously published card files available for existing links. New filenames avoid reusing stale image URLs, although social platforms may continue to cache the page metadata until they fetch it again.

The rendering script deliberately excludes the homepage so it cannot overwrite the approved premium artwork. Update its image URLs, dimensions, and alt text together in `server/templates/landing-page.html` when replacing it.
