.PHONY: setup api web dev test test-engine test-web

setup:
	cd engine && uv sync
	cd web && npm install

api:
	cd engine && uv run uvicorn tracedna.api.main:app --reload --port 8000

web:
	cd web && npm run dev

dev:
	$(MAKE) -j2 api web

test: test-engine test-web

test-engine:
	cd engine && uv run pytest

test-web:
	cd web && npm test -- --run
