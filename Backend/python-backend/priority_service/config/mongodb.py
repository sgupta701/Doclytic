from typing import Optional

from pymongo import MongoClient
from pymongo.database import Database

from .settings import settings


_client: Optional[MongoClient] = None
_db: Optional[Database] = None


def get_mongo_client() -> MongoClient:
    """Create (once) and return the shared MongoDB client."""
    global _client

    if _client is None:
        if not settings.mongo_uri:
            raise RuntimeError("MONGO_URI is not set")
        _client = MongoClient(settings.mongo_uri)
    return _client


def get_database() -> Database:
    """Return the configured MongoDB database handle."""
    global _db

    if _db is None:
        _db = get_mongo_client()[settings.mongo_db_name]
    return _db
