# Catalog imagery

Place one image per garment in this folder. The filename (without extension)
must match the garment's `image` key in `server/data/catalog.json`:

| Garment  | File                  |
|----------|-----------------------|
| Aube     | `aube.jpg`            |
| Minuit   | `minuit.jpg`          |
| Vellum   | `vellum.jpg`          |
| Sérac    | `serac.jpg`           |
| Ombre    | `ombre.jpg`           |
| Lisière  | `lisiere.jpg`         |
| Calme    | `calme.jpg`           |
| Rivage   | `rivage.jpg`          |
| Noctis   | `noctis.jpg`          |
| Albâtre  | `albatre.jpg`         |
| Brume    | `brume.jpg`           |
| Ardent   | `ardent.jpg`          |

- Accepted: `.jpg` `.jpeg` `.png` `.webp` `.avif`
- Use flat product shots (on a plain background or ghost mannequin), portrait
  orientation (3:4 is ideal), at least 1200 px tall. These same files are sent
  to genlook as the product image.
- Any additional image dropped here is shown in the salon automatically
  (named from its filename, "Price on request") until it is described in
  `catalog.json`.
- Until a file exists, the salon shows an elegant placeholder for that piece.
