"""Uvicorn entrypoint for the API container."""

import uvicorn

from aeropulse_api.app import create_app

app = create_app()


def main() -> None:
    """Run the API on 0.0.0.0:8000."""
    uvicorn.run("aeropulse_api.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    main()
