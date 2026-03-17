"""
Sample Data Seeder for Infinity Lock Admin Panel
Seeds mock app users, feedback, and security logs for testing
"""
import asyncio
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import uuid

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

LANGUAGES = ["en", "hi", "es", "fr", "de", "pt", "ja", "ko", "zh", "ar", "ru", "it"]
COUNTRIES = ["US", "IN", "BR", "GB", "DE", "FR", "JP", "KR", "AU", "CA", "MX", "ES"]

FEEDBACK_MESSAGES = [
    "Great app! Love the fingerprint unlock feature.",
    "Could you add support for more disguise options?",
    "The app sometimes crashes when I try to lock WhatsApp.",
    "Premium plan is worth it! No more ads.",
    "Please add widget customization options.",
    "Face unlock is not working properly on my device.",
    "Can you add a backup/restore feature?",
    "Love the intruder selfie feature!",
    "App is draining too much battery.",
    "Best app lock I've ever used. Thank you!",
]


async def seed_sample_data():
    """Seed sample data for testing"""
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Check if data already exists
        user_count = await db.app_users.count_documents({})
        if user_count > 0:
            print(f"Sample data already exists ({user_count} users). Skipping seed.")
            return
        
        print("Seeding sample app users...")
        
        # Generate 150 sample users
        users = []
        now = datetime.now(timezone.utc)
        
        for i in range(150):
            installed_days_ago = random.randint(1, 180)
            installed_at = now - timedelta(days=installed_days_ago)
            
            # 15% uninstalled
            uninstalled = random.random() < 0.15
            uninstalled_at = None
            if uninstalled:
                uninstalled_days = random.randint(1, installed_days_ago)
                uninstalled_at = (now - timedelta(days=uninstalled_days)).isoformat()
            
            # 20% premium
            plan = "premium" if random.random() < 0.2 else "classic"
            
            user = {
                "id": str(uuid.uuid4()),
                "device_id": f"device_{uuid.uuid4().hex[:12]}",
                "email": f"user{i+1}@example.com" if random.random() < 0.6 else None,
                "plan": plan,
                "status": "active" if not uninstalled else "deactivated",
                "language": random.choice(LANGUAGES),
                "country": random.choice(COUNTRIES),
                "email_verified": random.random() < 0.7,
                "biometric_enabled": random.random() < 0.65,
                "face_unlock_enabled": random.random() < 0.25,
                "intruder_selfie_enabled": plan == "premium" and random.random() < 0.7,
                "secured_apps_count": random.randint(3, 25),
                "installed_at": installed_at.isoformat(),
                "last_active": (now - timedelta(days=random.randint(0, 30))).isoformat() if not uninstalled else None,
                "uninstalled_at": uninstalled_at,
            }
            users.append(user)
        
        await db.app_users.insert_many(users)
        print(f"Seeded {len(users)} app users")
        
        # Seed feedback
        print("Seeding sample feedback...")
        feedback_list = []
        
        for i in range(25):
            created_days_ago = random.randint(1, 60)
            status = random.choice(["new", "new", "new", "reviewed", "responded"])
            
            feedback = {
                "id": str(uuid.uuid4()),
                "user_id": random.choice(users)["id"],
                "message": random.choice(FEEDBACK_MESSAGES),
                "status": status,
                "admin_response": "Thank you for your feedback!" if status == "responded" else None,
                "created_at": (now - timedelta(days=created_days_ago)).isoformat(),
                "reviewed_at": (now - timedelta(days=created_days_ago - 1)).isoformat() if status in ["reviewed", "responded"] else None,
                "reviewed_by": None,
            }
            feedback_list.append(feedback)
        
        await db.feedback.insert_many(feedback_list)
        print(f"Seeded {len(feedback_list)} feedback entries")
        
        # Seed security logs
        print("Seeding security logs...")
        logs = []
        event_types = ["LOGIN_SUCCESS", "LOGIN_FAILED", "TOTP_VERIFICATION_FAILED", "USER_SUSPENDED", "SETTINGS_UPDATED"]
        
        for i in range(50):
            created_hours_ago = random.randint(1, 168)  # Last week
            
            log = {
                "id": str(uuid.uuid4()),
                "event_type": random.choice(event_types),
                "admin_id": "super-admin-001" if random.random() < 0.8 else None,
                "user_id": random.choice(users)["id"] if random.random() < 0.3 else None,
                "ip_address": f"192.168.{random.randint(1,255)}.{random.randint(1,255)}",
                "details": {"source": "admin_panel"},
                "timestamp": (now - timedelta(hours=created_hours_ago)).isoformat(),
            }
            logs.append(log)
        
        await db.security_logs.insert_many(logs)
        print(f"Seeded {len(logs)} security logs")
        
        # Seed default settings
        await db.settings.update_one(
            {"type": "app_settings"},
            {
                "$set": {
                    "privacy_policy": """# Privacy Policy

## Introduction
Infinity Lock ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information.

## Information We Collect
- Device information for app functionality
- Email address (optional) for account recovery
- Usage analytics (anonymized)
- Intruder selfies (Premium plan only, with consent)

## How We Use Your Information
- To provide app-lock functionality
- To authenticate and secure your device
- To improve our services

## Data Retention
- Security logs: 5-10 days depending on plan
- Account data: Until account deletion
- Intruder selfies: 10 days (Premium only)

## Your Rights
You have the right to access, correct, or delete your personal data. Contact us at support@infinitylock.com.

Last updated: January 2024""",
                    "terms_of_service": """# Terms of Service

## Acceptance of Terms
By using Infinity Lock, you agree to these Terms of Service.

## Service Description
Infinity Lock provides app-locking functionality to secure applications on your device.

## User Responsibilities
- Maintain security of your authentication credentials
- Use the service in compliance with applicable laws
- Do not attempt to bypass security measures

## Premium Features
Premium subscribers gain access to additional features including ad-free experience, intruder selfie, and extended log retention.

## Limitation of Liability
Infinity Lock is provided "as is" without warranties of any kind.

## Changes to Terms
We may update these terms at any time. Continued use constitutes acceptance.

Last updated: January 2024""",
                    "updated_at": now.isoformat(),
                    "updated_by": "SYSTEM_SEED",
                }
            },
            upsert=True
        )
        print("Seeded default settings")
        
        print("\n✅ Sample data seeding complete!")
        
    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(seed_sample_data())
