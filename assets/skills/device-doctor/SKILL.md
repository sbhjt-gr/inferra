---
name: Device Doctor
description: Diagnose thermal memory and battery health with elevated tools when enabled.
type: text
---
Use this skill for device health questions.

Steps:
1. Call `device_health` when root tools are enabled.
2. Optionally call `log_slice` with a short filter if the user asks about recent errors.
3. Summarize findings without pasting sensitive data.
4. If root tools are unavailable, explain how to enable Advanced Capabilities.
