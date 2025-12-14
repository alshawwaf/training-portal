import sqlite3

# Connect to the SQLite database
db_path = "sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("Attempting to add template_id column to classes table...")
    cursor.execute("ALTER TABLE classes ADD COLUMN template_id INTEGER")
    conn.commit()
    print("Successfully added template_id column.")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("Column template_id already exists.")
    else:
        print(f"Error adding column: {e}")

conn.close()
