---
name: web-search
description: Internet research capabilities using Brave Search MCP
triggers:
  - search the web for
  - find information about
  - competitive analysis
  - market research
  - latest news on
---

# Web Search Skill

## When to Use
Use this skill when you need to:
- Perform competitive analysis or market research
- Find current information about technologies, trends, or events
- Research user behavior patterns or industry benchmarks
- Look up documentation or examples from the web

## MCP Check (Run First)
Before using web search tools, verify MCP availability:
1. Check if `brave_web_search` tool is available
2. If unavailable, fall back to `fetch` tool for specific URLs
3. Ask user to provide information if no search capability

## Available Tools (When MCP Active)
| Tool | Purpose |
|------|---------|
| `brave_web_search` | General web queries with filtering |
| `brave_news_search` | Current events, recent developments |
| `brave_local_search` | Business/location info (Pro tier) |
| `brave_image_search` | Image search with metadata |
| `brave_summarizer` | AI summaries (use summary:true) |

## Search Patterns

### Competitive Analysis
1. Search for competitor name + product type
2. Search for reviews, comparisons
3. Compile findings into structured report

### Technology Research
1. Search for technology + "best practices"
2. Search for technology + "alternatives"
3. Search for recent news/updates

## Graceful Degradation
If MCP unavailable:
1. Use `fetch` tool for known documentation URLs
2. Request user to provide specific URLs or information
3. Analyze codebase for existing similar implementations
4. Clearly state what information is missing

## Configuration
Requires Brave Search API key. See docs/MCP-SETUP.md for setup.
