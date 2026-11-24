
"""Run pending PostgreSQL database migrations safely."""

import re
from pathlib import Path

import psycopg

from backend.database import _get_database_url


# Keep migration files in one predictable project directory.
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def normalize_migration_sql(sql: str) -> str:
    # Remove transaction wrappers while preserving the migration SQL.
    # The runner manages transactions so schema changes and tracking records
    # are committed or rolled back together.
    sql = re.sub(
        r"^\s*BEGIN\s*;\s*$",
        "",
        sql,
        count=1,
        flags=re.IGNORECASE | re.MULTILINE,
    )

    sql = re.sub(
        r"^\s*COMMIT\s*;\s*$",
        "",
        sql,
        count=1,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    return sql


def run_migrations() -> None:
    """Apply pending migrations and record each successful execution."""

    with psycopg.connect(_get_database_url()) as connection:
        with connection.cursor() as cursor:

            # Create the migration history table if it does not exist.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Detect whether migration 001 was already applied manually.
            cursor.execute("""
                SELECT
                    to_regclass('public.sessions'),
                    to_regclass('public.conversation_turns'),
                    EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'documents'
                          AND column_name = 'session_id'
                    )
            """)

            sessions, conversations, documents_updated = cursor.fetchone() # type: ignore

            if sessions and conversations and documents_updated:
                cursor.execute("""
                    INSERT INTO schema_migrations (version)
                    VALUES ('001_create_sessions.sql')
                    ON CONFLICT (version) DO NOTHING
                """)

            # Discover migration files and process them in version order.
            migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

            for migration_file in migration_files:
                version = migration_file.name

                cursor.execute(
                    "SELECT 1 FROM schema_migrations WHERE version = %s",
                    (version,),
                )

                if cursor.fetchone():
                    print(f"Already applied: {version}")
                    continue

                print(f"Applying migration: {version}")

                sql = normalize_migration_sql(
                    migration_file.read_text(encoding="utf-8")
                )

                # Execute the migration and record it in the same transaction.
                cursor.execute(sql) # type: ignore

                cursor.execute(
                    """
                    INSERT INTO schema_migrations (version)
                    VALUES (%s)
                    """,
                    (version,),
                )

                print(f"Successfully applied: {version}")

        # The connection context commits successful migrations.
    print("Database migrations completed.")


if __name__ == "__main__":
    run_migrations()
