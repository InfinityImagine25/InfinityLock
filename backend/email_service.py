"""
Email Service using Resend for Infinity Lock Admin Panel
Handles OTP sending for admin verification
"""
import os
import asyncio
import logging
import resend
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

# Configure Resend
resend.api_key = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

logger = logging.getLogger(__name__)


async def send_otp_email(recipient_email: str, otp_code: str, purpose: str = "verification") -> dict:
    """
    Send OTP email using Resend
    
    Args:
        recipient_email: Email address to send OTP to
        otp_code: 6-digit OTP code
        purpose: Purpose of OTP (verification, password_reset, unlock)
    
    Returns:
        dict with status and email_id
    """
    subject_map = {
        "verification": "Infinity Lock - Email Verification Code",
        "password_reset": "Infinity Lock - Password Reset Code",
        "unlock": "Infinity Lock - Account Unlock Code",
        "login": "Infinity Lock - Login Verification Code",
    }
    
    subject = subject_map.get(purpose, "Infinity Lock - Verification Code")
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0A0A0B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0A0A0B;">
            <tr>
                <td style="padding: 40px 20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #101012; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <div style="width: 56px; height: 56px; background: rgba(59, 130, 246, 0.2); border-radius: 12px; display: inline-block; line-height: 56px;">
                                    <span style="font-size: 24px;">🔐</span>
                                </div>
                                <h1 style="margin: 16px 0 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                                    INFINITY LOCK
                                </h1>
                                <p style="margin: 4px 0 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">
                                    Admin Panel
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 32px;">
                                <p style="margin: 0 0 24px; color: #e2e8f0; font-size: 16px; line-height: 1.5;">
                                    Your verification code is:
                                </p>
                                
                                <!-- OTP Code Box -->
                                <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                                    <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; color: #3B82F6; letter-spacing: 8px;">
                                        {otp_code}
                                    </span>
                                </div>
                                
                                <p style="margin: 0 0 16px; color: #94a3b8; font-size: 14px; line-height: 1.5;">
                                    This code will expire in <strong style="color: #f59e0b;">10 minutes</strong>.
                                </p>
                                
                                <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                                    If you didn't request this code, please ignore this email or contact support if you have concerns.
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.05); text-align: center;">
                                <p style="margin: 0; color: #475569; font-size: 12px;">
                                    © {datetime.now().year} Infinity Lock. All rights reserved.
                                </p>
                                <p style="margin: 8px 0 0; color: #334155; font-size: 11px;">
                                    This is an automated message. Please do not reply.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient_email],
        "subject": subject,
        "html": html_content,
    }
    
    try:
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"OTP email sent to {recipient_email}, email_id: {email.get('id')}")
        return {
            "status": "success",
            "message": f"OTP sent to {recipient_email}",
            "email_id": email.get("id"),
        }
    except Exception as e:
        logger.error(f"Failed to send OTP email to {recipient_email}: {str(e)}")
        # Fallback: log OTP to console for testing
        logger.warning(f"[FALLBACK] OTP for {recipient_email}: {otp_code}")
        print(f"\n[EMAIL OTP] To: {recipient_email}, Code: {otp_code}\n")
        return {
            "status": "fallback",
            "message": f"Email service unavailable, OTP logged to console",
            "error": str(e),
        }


async def send_security_alert_email(
    recipient_email: str, 
    alert_type: str, 
    details: dict
) -> dict:
    """
    Send security alert email
    
    Args:
        recipient_email: Admin email address
        alert_type: Type of alert (failed_login, account_locked, new_admin)
        details: Alert details dict
    """
    alert_configs = {
        "failed_login": {
            "subject": "⚠️ Infinity Lock - Failed Login Attempt",
            "title": "Failed Login Attempt Detected",
            "color": "#f59e0b",
        },
        "account_locked": {
            "subject": "🔒 Infinity Lock - Account Locked",
            "title": "Account Has Been Locked",
            "color": "#ef4444",
        },
        "new_admin": {
            "subject": "👤 Infinity Lock - New Admin Created",
            "title": "New Administrator Account Created",
            "color": "#10b981",
        },
        "new_user": {
            "subject": "📱 Infinity Lock - New User Registration",
            "title": "New App User Registered",
            "color": "#3b82f6",
        },
        "plan_upgrade": {
            "subject": "⭐ Infinity Lock - Plan Upgrade",
            "title": "User Upgraded to Premium",
            "color": "#8b5cf6",
        },
    }
    
    config = alert_configs.get(alert_type, {
        "subject": "Infinity Lock - Security Alert",
        "title": "Security Alert",
        "color": "#64748b",
    })
    
    details_html = "".join([
        f'<tr><td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">{k}:</td>'
        f'<td style="padding: 8px 0 8px 16px; color: #e2e8f0; font-size: 13px; font-family: monospace;">{v}</td></tr>'
        for k, v in details.items()
    ])
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 0; background-color: #0A0A0B; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0A0A0B;">
            <tr>
                <td style="padding: 40px 20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #101012; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
                        <tr>
                            <td style="padding: 32px; border-left: 4px solid {config['color']};">
                                <h2 style="margin: 0 0 16px; color: {config['color']}; font-size: 18px;">
                                    {config['title']}
                                </h2>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    {details_html}
                                </table>
                                <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">
                                    {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient_email],
        "subject": config["subject"],
        "html": html_content,
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Security alert sent to {recipient_email}")
        return {"status": "success", "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Failed to send security alert: {str(e)}")
        return {"status": "error", "error": str(e)}
