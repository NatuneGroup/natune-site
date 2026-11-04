# Preview and capture provenance

The landing page shows two kinds of image side by side, and each one says which it is:

| Preview | Kind | Source |
| --- | --- | --- |
| Desktop · Home | **real app capture** | `public/assets/previews/desktop-home-linux-1440.webp` (+ `-720`) |
| Desktop · Library | **real app capture** | `public/assets/previews/desktop-library-linux-1440.webp` (+ `-720`) |
| Desktop · Player | labelled illustration | `public/assets/previews/desktop-player-{dark,light}.svg` |
| Android · Home/Library/Player | real app captures | `public/assets/previews/android-*.webp` |
| iOS · Home/Library/Player | labelled illustrations | `public/assets/previews/ios-*.svg` |

`scripts/generate-previews.mjs` regenerates only the illustrations. The desktop and Android captures are checked
in as assets, because they record a running build.

## Desktop Home and Library captures

| Field | Value |
| --- | --- |
| Release | Natune desktop Linux x64 nightly `N20261103`, build `b30ae6187afc` (packaged AppImage) |
| Capture | full client area, 1440x900, no window chrome, no mini player |
| Theme | light (the packaged default); the captures do **not** change with the site theme |
| Session | anonymous — no account, no sign-in, no playback |
| Home source | `linux-visual-qa/N20261103/home-light-clean-1440x900.png`, SHA-256 `0da83c5293db5a57ea3971b03b68848725d32dd088f77b9a47f824fbc84393fb` |
| Library source | `linux-visual-qa/N20261103/library-empty-light-1440x900.png`, SHA-256 `1dfb2784aa693856258d5268ec31166fdb59f779dc6de393e6c50fc28c1e3883` |
| Web payload | `desktop-home-linux-1440.webp` 136434 B / `-720.webp` 46838 B, `desktop-library-linux-1440.webp` 19404 B / `-720.webp` 7092 B |
| Output SHA-256 | 1440: `50e920d998fa4508e6106a918e7930c4303656d9d825766ba8760c989c5fc198` (home), `895adb38e50da4460224d19ab479f7383e5ce6077ba23411477f829779ec8ced` (library); 720: `60d167dffd21b60b419e5e5376a6922403b987adc5fea4a46e86dfab34b96b8c` (home), `4dc50c59f3d1e870fd491a37242e1c0de4e07d0274afaa8241a8aad4c2ab7163` (library) |

An earlier capture of the same Home screen (`home-light-1440x900.png`, SHA-256 `150339f2...`) has the mini player
drawn over the feed and is deliberately **not** used.

The 720-wide candidates are half-scale; the page offers them through `srcset`/`sizes` so a phone downloads 47 KB
instead of 136 KB. Both sizes keep the 1440x900 (16:10) frame, which is the aspect ratio the desktop tile and the
preview lightbox use (`--preview-ratio: 1440 / 900`).

### Regenerating the WebP files

The repository vendors no image tool. From the two PNG sources above:

```bash
python3 - <<'PY'
from PIL import Image
for name in ("home-light-clean-1440x900", "library-empty-light-1440x900"):
    out = "desktop-home-linux" if name.startswith("home") else "desktop-library-linux"
    with Image.open(name + ".png") as im:
        im = im.convert("RGB")
        for width in (1440, 720):
            frame = im if width == im.width else im.resize((width, width * im.height // im.width), Image.LANCZOS)
            frame.save(f"{out}-{width}.webp", "WEBP", quality=82, method=6)
PY
```

## Why the desktop Player is still an illustration

Playback could not be captured on the packaged build: YouTube refused the stream request (AntiBot) in the QA
sandbox, so no lyrics or player screen exists to record. The Player tile therefore keeps the generated
illustration, labelled "Windows/Linux/macOS · illustrative preview" in its caption and
"Illustrative Natune Player on desktop" in its alt text. Do not substitute a fabricated capture.
