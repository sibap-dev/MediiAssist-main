import os
from app import app, db

def reset_database():
    """
    Drop all existing tables and recreate them fresh.
    This ensures a clean database state.
    """
    with app.app_context():
        print("Dropping all existing tables...")
        db.drop_all()
        print("Creating fresh tables...")
        db.create_all()
        print("✓ Database reset complete!")
        print("\nNow you can:")
        print("1. Run: python app.py")
        print("2. Register a new user with mobile + password")
        print("3. Login with mobile + password")

if __name__ == "__main__":
    reset_database()
