#!/bin/bash
set -e

# Create the 'admin' database if it doesn't exist
# This is needed because pgAdmin tries to connect to a database matching the username
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    SELECT 'CREATE DATABASE admin'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'admin')\gexec
EOSQL

echo "Database 'admin' ensured to exist."
