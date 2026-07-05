---
name: Web Search
description: Search the web for current information.
type: js
scriptName: index
---
Use this skill when the user needs recent facts, release versions, news, or source-backed answers from the web.

## Instructions

1. Call `load_skill` with skillName "Web Search".
2. Call `run_js` with:
   - **skillName**: Web Search
   - **scriptName**: index
   - **data**: JSON string with:
     - **query**: Required. A focused web search query (e.g. "latest Expo SDK version").
     - **maxResults**: Optional. Number of results, default 6.

3. Summarize the search results for the user. Cite titles and URLs when available.

**Constraints:**
- Use this skill for time-sensitive or web-only facts. Do not guess release versions from memory.
- Keep the final answer concise and end with a complete sentence.
