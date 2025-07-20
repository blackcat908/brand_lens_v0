import pandas as pd
from sqlalchemy import create_engine, inspect

# Paths and connection strings
SQLITE_DB_PATH = r"C:\Users\tejab\Downloads\brand-dashboard-two\backend\migrations\reviews.db"
POSTGRES_CONN_STR = "postgresql://postgres:gyRafIdjWaKHngpJqYJfbGDcYNzaaIyn@switchyard.proxy.rlwy.net:17267/railway"

# Create SQLAlchemy engines
sqlite_engine = create_engine(f"sqlite:///{SQLITE_DB_PATH}")
postgres_engine = create_engine(POSTGRES_CONN_STR)

# Get table names from SQLite
inspector = inspect(sqlite_engine)
tables = inspector.get_table_names()

print(f"Found tables: {tables}")

for table in tables:
    print(f"Migrating table: {table}")
    # Read data from SQLite
    df = pd.read_sql_table(table, sqlite_engine)
    # Write data to PostgreSQL
    df.to_sql(table, postgres_engine, if_exists='replace', index=False)
    print(f"Table {table} migrated successfully.")

print("Migration complete!") 