"""
Super-Admin Seed Script for Infinity Lock Admin Panel

This script creates the initial Super-Admin account on first database initialization.
It is idempotent - it will not recreate the account if it already exists.

Usage:
    python seed_superadmin.py

Environment Variables Required:
    - MONGO_URL: MongoDB connection string
    - DB_NAME: Database name
    - SUPER_ADMIN_EMAIL: Email for the super admin account
"""
import os
import sys
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import auth utilities
from auth import (
    generate_secure_password,
    hash_password,
    generate_totp_secret,
    get_totp_provisioning_uri,
)


# Configuration
SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "infinityimagine@outlook.com")
CREDENTIALS_FILE = ROOT_DIR / "initial_credentials.json"


async def seed_super_admin():
    """
    Create the Super-Admin account if it doesn't exist.
    
    This function is idempotent - calling it multiple times will not create
    duplicate accounts or modify an existing Super-Admin account.
    """
    # Connect to MongoDB
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    
    if not mongo_url or not db_name:
        print("ERROR: MONGO_URL and DB_NAME environment variables are required")
        sys.exit(1)
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Check if Super-Admin already exists
        existing_admin = await db.admin_users.find_one({"role": "super_admin"})
        
        if existing_admin:
            print(f"Super-Admin already exists: {existing_admin['email']}")
            print("Skipping seed process (idempotent check passed)")
            return False
        
        # Generate secure credentials
        password = generate_secure_password(20)
        password_hash = hash_password(password)
        totp_secret = generate_totp_secret()
        provisioning_uri = get_totp_provisioning_uri(totp_secret, SUPER_ADMIN_EMAIL)
        
        # Create Super-Admin document
        super_admin = {
            "id": "super-admin-001",
            "email": SUPER_ADMIN_EMAIL,
            "password_hash": password_hash,
            "role": "super_admin",
            "status": "active",
            "totp_secret": totp_secret,
            "totp_enabled": True,  # Required for super admin
            "email_verified": True,  # Pre-verified for seed account
            "failed_attempts": 0,
            "lockout_until": None,
            "last_login": None,
            "password_changed_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "SYSTEM_SEED",
        }
        
        # Insert into database
        await db.admin_users.insert_one(super_admin)
        
        # Save credentials to secure file (excluded from git)
        credentials = {
            "email": SUPER_ADMIN_EMAIL,
            "initial_password": password,
            "totp_secret": totp_secret,
            "provisioning_uri": provisioning_uri,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "note": "CHANGE PASSWORD IMMEDIATELY AFTER FIRST LOGIN",
            "admin_panel_url": "/admin/login",
        }
        
        with open(CREDENTIALS_FILE, "w") as f:
            json.dump(credentials, f, indent=2)
        
        # Set restrictive permissions on credentials file
        os.chmod(CREDENTIALS_FILE, 0o600)
        
        # Log success
        timestamp = datetime.now(timezone.utc).isoformat()
        print("=" * 60)
        print("SUPER-ADMIN ACCOUNT CREATED SUCCESSFULLY")
        print("=" * 60)
        print(f"Email: {SUPER_ADMIN_EMAIL}")
        print(f"Timestamp: {timestamp}")
        print(f"Credentials saved to: {CREDENTIALS_FILE}")
        print("")
        print("TOTP Secret (for Google Authenticator):")
        print(f"  {totp_secret}")
        print("")
        print("Provisioning URI:")
        print(f"  {provisioning_uri}")
        print("")
        print("IMPORTANT SECURITY NOTES:")
        print("1. Change the initial password immediately after first login")
        print("2. Set up TOTP in your authenticator app before logging in")
        print("3. Delete or secure the credentials file after setup")
        print("4. Admin Panel URL: /admin/login")
        print("=" * 60)
        
        # Log to security audit
        await db.security_logs.insert_one({
            "id": f"log-{datetime.now(timezone.utc).timestamp()}",
            "event_type": "SUPER_ADMIN_CREATED",
            "admin_id": "SYSTEM",
            "details": {
                "email": SUPER_ADMIN_EMAIL,
                "method": "seed_script",
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to create Super-Admin: {e}")
        sys.exit(1)
    finally:
        client.close()


async def delete_super_admin(confirm: bool = False):
    """
    Secure deletion of Super-Admin for production handoff.
    Use with extreme caution.
    """
    if not confirm:
        print("WARNING: This will permanently delete the Super-Admin account.")
        print("Pass confirm=True to proceed.")
        return False
    
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        result = await db.admin_users.delete_one({"role": "super_admin"})
        
        if result.deleted_count > 0:
            print("Super-Admin account deleted successfully")
            
            # Remove credentials file if exists
            if CREDENTIALS_FILE.exists():
                os.remove(CREDENTIALS_FILE)
                print("Credentials file removed")
            
            return True
        else:
            print("No Super-Admin account found to delete")
            return False
            
    finally:
        client.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Infinity Lock Super-Admin Management")
    parser.add_argument("--delete", action="store_true", help="Delete Super-Admin (use with caution)")
    parser.add_argument("--confirm", action="store_true", help="Confirm deletion")
    
    args = parser.parse_args()
    
    if args.delete:
        asyncio.run(delete_super_admin(confirm=args.confirm))
    else:
        asyncio.run(seed_super_admin())
