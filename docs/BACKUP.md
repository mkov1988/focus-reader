# Backup and restore

Why this file exists: the story starts and scene anchors are token positions
computed against the exact bytes of our mirrored texts. Gutenberg reissues
texts, so a fresh crawl is NOT a restore. Losing every copy of the corpus
would misalign every start and recap permanently.

## The backup: a second R2 bucket

`npm run backup:r2` (scripts/backup-r2.mjs) maintains a full copy in the
private `focus-reader-books-backup` bucket: the 55,863 book corpus (copied
server side from the primary bucket, no local bandwidth), the crawl catalog
and quality gate records, and the covers. It verifies object counts and
bytes at the end and is safe to rerun any time; run it after any mirror run
or resweep (after `upload:r2`, so the primary is fresh first).

Cost: roughly thirty cents a month of R2 storage.

## Where every copy lives

| Data | Copies |
|---|---|
| Full 55,863 book corpus | this disk (mirror/books) + primary bucket + backup bucket |
| Crawl catalog + gate records | this disk (mirror/) + backup bucket (mirror-meta/) |
| Covers | this disk (public/covers) + live Pages deploy + backup bucket (covers/) |
| Curated texts (public/books) | this disk + live Pages deploy; regenerable from the mirror |
| Deep pass stores (scripts/deep-starts) | git, pushed to GitHub |
| Bucket keys (.r2.env at repo root) | this disk; keep a copy in the password manager |
| Android signing keystore | EAS cloud account; export per the Android repo's RELEASE.md |

Honest limit: both buckets sit in the one Cloudflare account, so this disk
is the only copy OUTSIDE that account. Three copies, two failure domains,
which is sound. If you ever want a third domain, the old option still works:

```bash
robocopy "C:\Users\Michael\Desktop\Focus Reader\mirror" "E:\focus-reader-backup\mirror" /E /Z /R:2 /W:2
```

## Restore

1. Mirror lost, buckets alive: download back into `mirror/books` with rclone
   from either bucket (credentials in .r2.env, see scripts/backup-r2.mjs for
   the flag set).
2. Primary bucket lost: recreate it, then `npm run upload:r2 -- --all` from
   the local mirror (or server side copy back from the backup bucket).
3. Disk lost: pull `mirror/` back from the backup bucket before anything
   else; the deep pass stores come back with `git clone`.
4. Never regenerate by recrawling Gutenberg unless you accept rebuilding
   starts-v1 and all scene maps afterward against the new bytes.
