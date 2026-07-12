---
name: File Maintenance
description: Copy files within approved shared storage paths.
type: text
---
Use this skill for elevated file copies under `/sdcard` or `/storage/emulated/0`.

Rules:
1. Confirm source and destination paths.
2. Call `file_copy` only after confirmation.
3. Refuse system or app-private paths.
4. Report success or the rejection reason.
