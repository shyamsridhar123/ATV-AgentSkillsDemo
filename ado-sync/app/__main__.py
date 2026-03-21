"""Entry point for running ADO Sync.

Usage:
    python -m app              # Start FastAPI server (default)
    python -m app --mcp        # Start MCP server for agent access
"""
import sys


def main():
    if "--mcp" in sys.argv:
        from .mcp_server import main as mcp_main
        mcp_main()
    else:
        import uvicorn
        uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="info")


main()
