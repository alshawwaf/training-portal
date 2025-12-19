"""
Migration script for Stage 2 - RBAC and User Registration.
Adds columns to users table and creates groups, permissions, and association tables.
"""
from db.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # 1. Add columns to users table
        columns = [
            ("is_active", "BOOLEAN DEFAULT TRUE"),
            ("is_email_confirmed", "BOOLEAN DEFAULT FALSE"),
            ("confirmation_code", "VARCHAR"),
            ("password_reset_required", "BOOLEAN DEFAULT FALSE"),
            ("last_login", "TIMESTAMP"),
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        ]
        
        for col_name, col_type in columns:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                print(f"Added column: {col_name}")
            except Exception as e:
                print(f"Column {col_name} might already exist: {e}")

        # 2. Create RBAC tables
        tables = [
            """
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR UNIQUE NOT NULL,
                description VARCHAR
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS permissions (
                id SERIAL PRIMARY KEY,
                name VARCHAR UNIQUE NOT NULL,
                description VARCHAR
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_groups (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, group_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS group_permissions (
                group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (group_id, permission_id)
            )
            """
        ]
        
        for table_sql in tables:
            try:
                conn.execute(text(table_sql))
                print("Applied table SQL")
            except Exception as e:
                print(f"Failed to apply table SQL: {e}")

        # 3. Seed default groups and permissions
        try:
            conn.execute(text("INSERT INTO groups (name, description) VALUES ('Super Admin', 'Full system access') ON CONFLICT DO NOTHING"))
            conn.execute(text("INSERT INTO groups (name, description) VALUES ('Instructor', 'Manage assigned classes') ON CONFLICT DO NOTHING"))
            conn.execute(text("INSERT INTO groups (name, description) VALUES ('Student', 'View assigned classes and environments') ON CONFLICT DO NOTHING"))
            print("Seeded default groups")
        except Exception as e:
            print(f"Failed to seed groups: {e}")

        conn.commit()
        print("Migration complete!")

if __name__ == "__main__":
    migrate()
