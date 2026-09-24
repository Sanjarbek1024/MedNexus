PYTHON ?= python3.11
VENV_PY = backend/.venv/bin/python

.PHONY: setup samples dev test docker

setup:
	$(PYTHON) -m venv backend/.venv
	$(VENV_PY) -m pip install -r backend/requirements-dev.txt
	cd frontend && npm ci
	test -f backend/.env || cp backend/.env.example backend/.env

samples:
	$(VENV_PY) scripts/download_samples.py

dev:
	$(VENV_PY) scripts/dev.py

test:
	cd backend && .venv/bin/python -m pytest

docker:
	docker compose up --build
