import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class PrioritySettings:
    mongo_uri: str = os.getenv("MONGO_URI", "").strip()
    mongo_db_name: str = os.getenv("MONGO_DB_NAME", "test").strip()
    document_collection: str = os.getenv("MONGO_DOCUMENT_COLLECTION", "documents").strip()
    extraction_collection: str = os.getenv("MONGO_EXTRACTION_COLLECTION", "documentextractions").strip()
    priority_collection: str = os.getenv("MONGO_PRIORITY_COLLECTION", "documentpriorities").strip()
    engine_version: str = os.getenv("PRIORITY_ENGINE_VERSION", "v0-skeleton").strip()


settings = PrioritySettings()
