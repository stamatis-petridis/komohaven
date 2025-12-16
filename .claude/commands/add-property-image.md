# Add Property Image

Add a new image to a property's gallery.

## Your Task

1. Ask which property: `blue-dream` or `studio-9`

2. List current images in the property's assets folder:
   ```bash
   ls -la properties/<slug>/assets/
   ```

3. Guide the user to:
   - Place the new image in `properties/<slug>/assets/`
   - Use sequential naming (e.g., if 1-4.jpeg exist, use 5.jpeg)
   - Recommend JPEG format, reasonable size (< 500KB)

4. Update the property's `index.html` gallery section to include the new image

5. The lightbox functionality (click to expand) works automatically via `script.js`

## Gallery HTML Structure
```html
<div class="gallery">
  <img src="assets/1.jpeg" alt="Property interior" />
  <img src="assets/2.jpeg" alt="Property view" />
  <!-- Add new images here -->
</div>
```

## Notes
- Provide descriptive alt text for accessibility
- Keep image aspect ratios consistent for visual harmony
- Gallery uses CSS grid, adjusts automatically to number of images
