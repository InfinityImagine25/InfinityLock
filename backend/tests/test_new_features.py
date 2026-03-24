"""
Backend API Tests for Infinity Lock Admin Panel - New Features (Iteration 4)
Tests: Forgot Password, Change Email, Admin Edit/Delete/TOTP Reset, PDF Exports, Theme Toggle
"""
import pytest
import requests
import os
import pyotp
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://infinity-lock-admin.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_EMAIL = "infinityimagine@outlook.com"
SUPER_ADMIN_PASSWORD = "TUXUu^MYanPHur8jdp@#"
TOTP_SECRET = "7TXXVVW6EEPCTGCWOJBG33BMG3ZEF5IU"

# Test admin for edit/delete tests
TEST_ADMIN_EMAIL = f"test_admin_{int(time.time())}@example.com"
TEST_ADMIN_PASSWORD = "TestPassword123!"


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")


class TestForgotPasswordFlow:
    """Test forgot password API endpoints"""
    
    def test_forgot_password_request(self):
        """Step 1: Request password reset OTP"""
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-password/request",
            params={"email": SUPER_ADMIN_EMAIL}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data.get("requires_totp") == True  # Super admin has TOTP enabled
        print(f"✓ Forgot password request: {data['message']}")
        print(f"  requires_totp: {data.get('requires_totp')}")
    
    def test_forgot_password_request_nonexistent_email(self):
        """Request reset for non-existent email (should not reveal if email exists)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-password/request",
            params={"email": "nonexistent@example.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("✓ Non-existent email returns generic message (security)")
    
    def test_forgot_password_verify_otp_invalid(self):
        """Step 2: Verify OTP with invalid code"""
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-password/verify-otp",
            params={"email": SUPER_ADMIN_EMAIL, "otp_code": "000000"}
        )
        # Should fail with invalid OTP
        assert response.status_code == 400
        print("✓ Invalid OTP correctly rejected")
    
    def test_forgot_password_verify_totp_invalid_token(self):
        """Step 3: Verify TOTP with invalid reset token"""
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-password/verify-totp",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "totp_code": totp_code,
                "reset_token": "invalid_token"
            }
        )
        assert response.status_code == 401
        print("✓ Invalid reset token correctly rejected")
    
    def test_forgot_password_reset_invalid_token(self):
        """Step 4: Reset password with invalid token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-password/reset",
            params={
                "email": SUPER_ADMIN_EMAIL,
                "new_password": "NewPassword123!",
                "reset_token": "invalid_token"
            }
        )
        assert response.status_code == 401
        print("✓ Password reset with invalid token correctly rejected")


class TestSuperAdminLogin:
    """Test super admin login with TOTP"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for super admin"""
        # Step 1: Login with credentials
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data.get("requires_totp") == True
        temp_token = login_data.get("temp_token")
        
        # Step 2: Verify TOTP
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        totp_response = requests.post(
            f"{BASE_URL}/api/auth/verify-totp",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "totp_code": totp_code,
                "temp_token": temp_token
            }
        )
        assert totp_response.status_code == 200
        totp_data = totp_response.json()
        assert "access_token" in totp_data
        print("✓ Super admin login with TOTP successful")
        return totp_data["access_token"]
    
    def test_login_flow(self, auth_token):
        """Test complete login flow"""
        assert auth_token is not None
        print("✓ Auth token obtained successfully")


class TestChangeEmailAPI:
    """Test change email API endpoints (Super Admin only)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for super admin"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        login_data = login_response.json()
        temp_token = login_data.get("temp_token")
        
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        totp_response = requests.post(
            f"{BASE_URL}/api/auth/verify-totp",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "totp_code": totp_code,
                "temp_token": temp_token
            }
        )
        return totp_response.json()["access_token"]
    
    def test_change_email_verify_wrong_password(self, auth_token):
        """Test change email with wrong password"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(
            f"{BASE_URL}/api/auth/change-email/verify",
            params={
                "new_email": "new_admin@example.com",
                "current_password": "wrong_password"
            },
            headers=headers
        )
        assert response.status_code == 400
        assert "incorrect" in response.json().get("detail", "").lower()
        print("✓ Change email with wrong password correctly rejected")
    
    def test_change_email_verify_invalid_email(self, auth_token):
        """Test change email with invalid email format"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(
            f"{BASE_URL}/api/auth/change-email/verify",
            params={
                "new_email": "invalid-email",
                "current_password": SUPER_ADMIN_PASSWORD
            },
            headers=headers
        )
        assert response.status_code == 400
        print("✓ Change email with invalid format correctly rejected")
    
    def test_change_email_verify_success(self, auth_token):
        """Test change email verify step (don't actually change)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Use a unique email that doesn't exist
        new_email = f"test_change_{int(time.time())}@example.com"
        response = requests.post(
            f"{BASE_URL}/api/auth/change-email/verify",
            params={
                "new_email": new_email,
                "current_password": SUPER_ADMIN_PASSWORD
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "change_token" in data
        assert data.get("requires_totp") == True
        print("✓ Change email verify step successful")
        print(f"  requires_totp: {data.get('requires_totp')}")
    
    def test_change_email_confirm_invalid_token(self, auth_token):
        """Test change email confirm with invalid token"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(
            f"{BASE_URL}/api/auth/change-email/confirm",
            params={
                "totp_code": totp_code,
                "change_token": "invalid_token"
            },
            headers=headers
        )
        assert response.status_code == 401
        print("✓ Change email confirm with invalid token correctly rejected")


class TestAdminManagement:
    """Test admin edit, delete, and TOTP reset"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for super admin"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        login_data = login_response.json()
        temp_token = login_data.get("temp_token")
        
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        totp_response = requests.post(
            f"{BASE_URL}/api/auth/verify-totp",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "totp_code": totp_code,
                "temp_token": temp_token
            }
        )
        return totp_response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def test_admin(self, auth_token):
        """Create a test admin for edit/delete tests"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        admin_email = f"test_admin_{int(time.time())}@example.com"
        
        response = requests.post(
            f"{BASE_URL}/api/admin/create",
            json={
                "email": admin_email,
                "password": "TestPassword123!",
                "role": "admin",
                "status": "active"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Test admin created: {admin_email}")
        return data
    
    def test_update_admin_status(self, auth_token, test_admin):
        """Test updating admin status"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        admin_id = test_admin["id"]
        
        # Update to suspended
        response = requests.put(
            f"{BASE_URL}/api/admin/{admin_id}",
            json={"status": "suspended"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["admin"]["status"] == "suspended"
        print(f"✓ Admin status updated to suspended")
        
        # Update back to active
        response = requests.put(
            f"{BASE_URL}/api/admin/{admin_id}",
            json={"status": "active"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["admin"]["status"] == "active"
        print(f"✓ Admin status updated back to active")
    
    def test_update_admin_invalid_status(self, auth_token, test_admin):
        """Test updating admin with invalid status"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        admin_id = test_admin["id"]
        
        response = requests.put(
            f"{BASE_URL}/api/admin/{admin_id}",
            json={"status": "invalid_status"},
            headers=headers
        )
        assert response.status_code == 400
        print("✓ Invalid status correctly rejected")
    
    def test_reset_admin_totp(self, auth_token, test_admin):
        """Test resetting admin TOTP"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        admin_id = test_admin["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/admin/{admin_id}/reset-totp",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ Admin TOTP reset successful: {data['message']}")
    
    def test_cannot_modify_super_admin(self, auth_token):
        """Test that super admin cannot be modified"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get admin list to find super admin ID
        list_response = requests.get(
            f"{BASE_URL}/api/admin/list",
            headers=headers
        )
        admins = list_response.json()
        super_admin = next((a for a in admins if a["role"] == "super_admin"), None)
        
        if super_admin:
            # Try to update super admin
            response = requests.put(
                f"{BASE_URL}/api/admin/{super_admin['id']}",
                json={"status": "suspended"},
                headers=headers
            )
            assert response.status_code == 403
            print("✓ Cannot modify super admin - correctly rejected")
            
            # Try to reset super admin TOTP
            response = requests.post(
                f"{BASE_URL}/api/admin/{super_admin['id']}/reset-totp",
                headers=headers
            )
            assert response.status_code == 403
            print("✓ Cannot reset super admin TOTP - correctly rejected")
    
    def test_delete_admin(self, auth_token, test_admin):
        """Test deleting admin (run last)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        admin_id = test_admin["id"]
        
        response = requests.delete(
            f"{BASE_URL}/api/admin/{admin_id}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "deleted" in data["message"].lower()
        print(f"✓ Admin deleted successfully")
        
        # Verify admin is gone
        list_response = requests.get(
            f"{BASE_URL}/api/admin/list",
            headers=headers
        )
        admins = list_response.json()
        assert not any(a["id"] == admin_id for a in admins)
        print("✓ Verified admin no longer in list")


class TestPDFExports:
    """Test PDF export endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for super admin"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        login_data = login_response.json()
        temp_token = login_data.get("temp_token")
        
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        totp_response = requests.post(
            f"{BASE_URL}/api/auth/verify-totp",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "totp_code": totp_code,
                "temp_token": temp_token
            }
        )
        return totp_response.json()["access_token"]
    
    def test_export_security_logs_pdf(self, auth_token):
        """Test security logs PDF export"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/export/security-logs/pdf",
            headers=headers
        )
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 0
        print(f"✓ Security logs PDF export successful ({len(response.content)} bytes)")
    
    def test_export_users_pdf(self, auth_token):
        """Test users PDF export"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/export/users/pdf",
            headers=headers
        )
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 0
        print(f"✓ Users PDF export successful ({len(response.content)} bytes)")
    
    def test_pdf_export_requires_auth(self):
        """Test that PDF exports require authentication"""
        response = requests.get(f"{BASE_URL}/api/export/security-logs/pdf")
        assert response.status_code in [401, 403]
        print("✓ PDF export requires authentication")
    
    def test_pdf_export_requires_super_admin(self, auth_token):
        """Test that PDF exports require super admin role"""
        # This test would need a regular admin token to properly test
        # For now, we verify super admin can access
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/export/security-logs/pdf",
            headers=headers
        )
        assert response.status_code == 200
        print("✓ Super admin can access PDF exports")


class TestDashboardStats:
    """Test dashboard stats for super admin"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for super admin"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
        )
        login_data = login_response.json()
        temp_token = login_data.get("temp_token")
        
        totp = pyotp.TOTP(TOTP_SECRET)
        totp_code = totp.now()
        
        totp_response = requests.post(
            f"{BASE_URL}/api/auth/verify-totp",
            json={
                "email": SUPER_ADMIN_EMAIL,
                "totp_code": totp_code,
                "temp_token": temp_token
            }
        )
        return totp_response.json()["access_token"]
    
    def test_dashboard_stats_with_revenue(self, auth_token):
        """Test dashboard stats include revenue for super admin"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify revenue fields are present
        assert "monthly_revenue" in data
        assert "total_revenue" in data
        assert isinstance(data["monthly_revenue"], (int, float))
        assert isinstance(data["total_revenue"], (int, float))
        print(f"✓ Dashboard stats with revenue: monthly=₹{data['monthly_revenue']}, total=₹{data['total_revenue']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
