# Backup and restore

Why this file exists: the story starts and scene anchors are token positions
computed against the exact bytes of our mirrored texts. Gutenberg reissues
texts, so a fresh crawl is NOT a restore. Losing the local mirror and the R2
bucket would misalign every start and recap permanently. Keep two homes for
everything below.

## What must be backed up, and where it lives

| Data | Only copies today | Backup |
|---|---|---|
| Deep pass stores (scripts/deep-starts) | git (committed Aug 2026) + this disk | pushed to GitHub |
| Curated texts + covers (public/books, public/covers) | this disk + the live Pages deploy | regenerable FROM the mirror below, so back up the mirror |
| Full 55,863 book mirror (mirror/books, ~19 GB) | this disk + the R2 bucket | **external drive, do this one by hand** |
| Bucket keys (.r2.env at repo root) | this disk | password manager |
| Android signing keystore | EAS cloud account only | see the Android repo's RELEASE.md |

## The one manual step: copy the mirror to an external drive

Plug in a drive (say it mounts as E:) and run:

```bash
robocopy "C:\Users\Michael\Desktop\Focus Reader\mirror" "E:\focus-reader-backup\mirror" /E /Z /R:2 /W:2
```

Rerun the same command any time after a new mirror run; it only copies what
changed. Refresh the copy whenever `mirror-all` or a resweep touches the files.

## Restore

1. Mirror lost, bucket alive: download the bucket back into `mirror/books`
   with rclone (see docs/SERVING.md for the remote setup), then rerun
   `npm run mirror:books` targets from it if public/ needs rebuilding.
2. Bucket lost, mirror alive: re-upload with `node scripts/upload-r2.mjs`.
3. Both lost: restore `mirror/` from the external drive, then re-upload.
4. Never regenerate by recrawling Gutenberg unless you accept rebuilding
   starts-v1 and all scene maps afterward against the new bytes.
