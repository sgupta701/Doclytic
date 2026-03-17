# Priority Service (Skeleton)

## Purpose

Rule-based priority engine pipeline:

1. Read extracted metadata
2. Compute priority score
3. Persist to MongoDB

## Structure

- `config/settings.py`: environment-driven config
- `config/mongodb.py`: shared `pymongo` connection helpers
- `services/metadata_extractor.py`: extraction normalization placeholder
- `services/priority_engine.py`: `compute_priority()` skeleton
- `services/priority_repository.py`: Mongo reads/writes for extraction and priority
- `pipeline/priority_pipeline.py`: orchestration entrypoint

## Usage

Call `run_priority_pipeline(document_id)` from your API or worker.

uvicorn app:app -reload --host 0.0.0.0 --port 8000
