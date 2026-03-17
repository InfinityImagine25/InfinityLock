#!/usr/bin/env python3
"""
Backend API Testing for Infinity Lock Admin Panel
Tests all API endpoints with proper TOTP authentication
"""

import requests
import pyotp
import sys
import json
from datetime import datetime
from typing import Optional, Dict, Any


class InfinityLockAPITester:
    def __init__(self, base_url: str = "https://rbac-deploy-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.access_token = None
        self.super_admin_creds = {
            "email": "infinityimagine@outlook.com",
            "password": "TUXUu^MYanPHur8jdp@#",
            "totp_secret": "7TXXVVW6EEPCTGCWOJBG33BMG3ZEF5IU"
        }
        self.regular_admin_creds = {
            "email": "admin@infinitylock.com",
            "password": "SecureAdmin123!"
        }
        self.test_results = {
            "passed": [],
            "failed": [],
            "total_tests": 0,
            "passed_count": 0
        }

    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        self.test_results["total_tests"] += 1
        if success:
            self.test_results["passed_count"] += 1
            self.test_results["passed"].append(f"✅ {test_name}")
            print(f"✅ {test_name}: PASSED")
        else:
            self.test_results["failed"].append(f"❌ {test_name}: {details}")
            print(f"❌ {test_name}: FAILED - {details}")
        
        if details and success:
            print(f"   Details: {details}")

    def generate_totp_code(self) -> str:
        """Generate current TOTP code"""
        totp = pyotp.TOTP(self.super_admin_creds["totp_secret"])
        return totp.now()

    def make_request(self, method: str, endpoint: str, data: Dict = None, 
                    headers: Dict = None, require_auth: bool = True, params_as_query: bool = False) -> requests.Response:
        """Make API request with proper headers"""
        url = f"{self.base_url}/api{endpoint}"
        
        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)
        
        if require_auth and self.access_token:
            request_headers["Authorization"] = f"Bearer {self.access_token}"

        if method.upper() == "GET":
            return self.session.get(url, headers=request_headers, params=data or {})
        elif method.upper() == "POST":
            if params_as_query:
                return self.session.post(url, headers=request_headers, params=data or {})
            else:
                return self.session.post(url, headers=request_headers, json=data or {})
        elif method.upper() == "PUT":
            return self.session.put(url, headers=request_headers, json=data or {})
        else:
            raise ValueError(f"Unsupported method: {method}")

    def test_health_endpoint(self):
        """Test /api/health endpoint"""
        try:
            response = self.make_request("GET", "/health", require_auth=False)
            
            if response.status_code == 200:
                data = response.json()
                if "status" in data:
                    self.log_test("Health Check", True, f"Status: {data.get('status')}")
                else:
                    self.log_test("Health Check", False, "Missing status field in response")
            else:
                self.log_test("Health Check", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Health Check", False, str(e))

    def test_login_and_totp(self) -> bool:
        """Test login flow with TOTP verification"""
        try:
            # Step 1: Initial login
            login_data = {
                "email": self.super_admin_creds["email"],
                "password": self.super_admin_creds["password"]
            }
            response = self.make_request("POST", "/auth/login", data=login_data, require_auth=False)
            
            if response.status_code != 200:
                self.log_test("Login Step 1", False, f"HTTP {response.status_code}: {response.text}")
                return False
            
            login_result = response.json()
            if not login_result.get("requires_totp"):
                self.log_test("Login Step 1", False, "Expected TOTP requirement for Super Admin")
                return False
            
            temp_token = login_result.get("temp_token")
            if not temp_token:
                self.log_test("Login Step 1", False, "No temp_token received")
                return False
            
            self.log_test("Login Step 1", True, "Received temp token")

            # Step 2: TOTP verification
            totp_code = self.generate_totp_code()
            totp_data = {
                "email": self.super_admin_creds["email"],
                "totp_code": totp_code,
                "temp_token": temp_token
            }
            
            response = self.make_request("POST", "/auth/verify-totp", data=totp_data, require_auth=False)
            
            if response.status_code != 200:
                self.log_test("TOTP Verification", False, f"HTTP {response.status_code}: {response.text}")
                return False
            
            totp_result = response.json()
            self.access_token = totp_result.get("access_token")
            
            if not self.access_token:
                self.log_test("TOTP Verification", False, "No access_token received")
                return False
            
            self.log_test("TOTP Verification", True, f"Role: {totp_result.get('role')}")
            return True

        except Exception as e:
            self.log_test("Login Flow", False, str(e))
            return False

    def test_dashboard_stats(self):
        """Test /api/analytics/dashboard endpoint"""
        try:
            response = self.make_request("GET", "/analytics/dashboard")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_installations", "active_users", "premium_users", "monthly_revenue"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Dashboard Stats", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("Dashboard Stats", True, f"Total users: {data.get('total_installations', 0)}")
            else:
                self.log_test("Dashboard Stats", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Dashboard Stats", False, str(e))

    def test_users_list(self):
        """Test /api/users/list endpoint"""
        try:
            response = self.make_request("GET", "/users/list")
            
            if response.status_code == 200:
                users = response.json()
                if isinstance(users, list):
                    self.log_test("Users List", True, f"Found {len(users)} app users")
                else:
                    self.log_test("Users List", False, "Response is not a list")
            else:
                self.log_test("Users List", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Users List", False, str(e))

    def test_feature_analytics(self):
        """Test /api/analytics/features endpoint"""
        try:
            response = self.make_request("GET", "/analytics/features")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["biometric_adoption_rate", "face_unlock_adoption_rate", "avg_secured_apps"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Feature Analytics", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("Feature Analytics", True, f"Biometric adoption: {data.get('biometric_adoption_rate', 0)}%")
            else:
                self.log_test("Feature Analytics", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Feature Analytics", False, str(e))

    def test_system_health(self):
        """Test /api/analytics/system-health endpoint"""
        try:
            response = self.make_request("GET", "/analytics/system-health")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["api_latency_ms", "error_rate", "auth_success_rate", "db_status"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("System Health", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("System Health", True, f"DB Status: {data.get('db_status')}, API Latency: {data.get('api_latency_ms')}ms")
            else:
                self.log_test("System Health", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("System Health", False, str(e))

    def test_feedback_list(self):
        """Test /api/feedback/list endpoint"""
        try:
            response = self.make_request("GET", "/feedback/list")
            
            if response.status_code == 200:
                feedback = response.json()
                if isinstance(feedback, list):
                    self.log_test("Feedback List", True, f"Found {len(feedback)} feedback entries")
                else:
                    self.log_test("Feedback List", False, "Response is not a list")
            else:
                self.log_test("Feedback List", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Feedback List", False, str(e))

    def test_settings(self):
        """Test /api/settings/ endpoint"""
        try:
            response = self.make_request("GET", "/settings/")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["privacy_policy", "terms_of_service", "updated_at"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Settings", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("Settings", True, "Settings retrieved successfully")
            else:
                self.log_test("Settings", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Settings", False, str(e))

    def test_security_logs(self):
        """Test /api/security-logs endpoint (Super Admin only)"""
        try:
            response = self.make_request("GET", "/security-logs")
            
            if response.status_code == 200:
                logs = response.json()
                if isinstance(logs, list):
                    self.log_test("Security Logs", True, f"Found {len(logs)} security log entries")
                else:
                    self.log_test("Security Logs", False, "Response is not a list")
            else:
                self.log_test("Security Logs", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Security Logs", False, str(e))

    def test_user_counts(self):
        """Test /api/users/count endpoint"""
        try:
            response = self.make_request("GET", "/users/count")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total", "active", "classic", "premium"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("User Counts", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("User Counts", True, f"Total: {data.get('total')}, Active: {data.get('active')}")
            else:
                self.log_test("User Counts", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("User Counts", False, str(e))

    def test_password_change_validations(self):
        """Test /api/auth/change-password endpoint validation"""
        try:
            # Test with wrong current password
            wrong_password_params = {
                "current_password": "wrongpassword",
                "new_password": "NewSecure123!"
            }
            response = self.make_request("POST", "/auth/change-password", data=wrong_password_params, params_as_query=True)
            
            if response.status_code == 400 and "incorrect" in response.text.lower():
                self.log_test("Password Change - Wrong Current Password", True, "Correctly rejected wrong password")
            else:
                self.log_test("Password Change - Wrong Current Password", False, f"Expected 400 with 'incorrect', got {response.status_code}: {response.text}")

            # Test with short new password
            short_password_params = {
                "current_password": self.super_admin_creds["password"],
                "new_password": "123"
            }
            response = self.make_request("POST", "/auth/change-password", data=short_password_params, params_as_query=True)
            
            if response.status_code == 400 and "8 characters" in response.text:
                self.log_test("Password Change - Short Password", True, "Correctly rejected short password")
            else:
                self.log_test("Password Change - Short Password", False, f"Expected 400 with '8 characters', got {response.status_code}: {response.text}")

            # Test with same password
            same_password_params = {
                "current_password": self.super_admin_creds["password"],
                "new_password": self.super_admin_creds["password"]
            }
            response = self.make_request("POST", "/auth/change-password", data=same_password_params, params_as_query=True)
            
            if response.status_code == 400 and "different" in response.text.lower():
                self.log_test("Password Change - Same Password", True, "Correctly rejected same password")
            else:
                self.log_test("Password Change - Same Password", False, f"Expected 400 with 'different', got {response.status_code}: {response.text}")

        except Exception as e:
            self.log_test("Password Change Validations", False, str(e))

    def test_admin_creation(self):
        """Test /api/admin/create endpoint (Super Admin only)"""
        try:
            # Test creating a new admin
            timestamp = datetime.now().strftime("%H%M%S")
            admin_data = {
                "email": f"testadmin{timestamp}@test.com",
                "password": "TestAdmin123!",
                "role": "admin",
                "status": "active"
            }
            
            response = self.make_request("POST", "/admin/create", data=admin_data)
            
            if response.status_code == 200:
                admin = response.json()
                required_fields = ["id", "email", "role", "status", "totp_enabled"]
                missing_fields = [field for field in required_fields if field not in admin]
                
                if missing_fields:
                    self.log_test("Admin Creation", False, f"Missing fields in response: {missing_fields}")
                else:
                    self.log_test("Admin Creation", True, f"Created admin: {admin.get('email')} with role: {admin.get('role')}")
                    
                    # Store the created admin ID for cleanup or further testing
                    self.created_admin_id = admin.get('id')
            else:
                self.log_test("Admin Creation", False, f"HTTP {response.status_code}: {response.text}")

            # Test creating admin with duplicate email
            duplicate_response = self.make_request("POST", "/admin/create", data=admin_data)
            if duplicate_response.status_code == 400 and "already registered" in duplicate_response.text:
                self.log_test("Admin Creation - Duplicate Email", True, "Correctly rejected duplicate email")
            else:
                self.log_test("Admin Creation - Duplicate Email", False, f"Expected 400 with 'already registered', got {duplicate_response.status_code}")

            # Test creating super admin (should fail)
            super_admin_data = {
                "email": f"superadmin{timestamp}@test.com",
                "password": "TestAdmin123!",
                "role": "super_admin",
                "status": "active"
            }
            super_response = self.make_request("POST", "/admin/create", data=super_admin_data)
            if super_response.status_code == 403 and "cannot create" in super_response.text.lower():
                self.log_test("Admin Creation - Super Admin Rejection", True, "Correctly rejected super_admin creation")
            else:
                self.log_test("Admin Creation - Super Admin Rejection", False, f"Expected 403, got {super_response.status_code}")

        except Exception as e:
            self.log_test("Admin Creation", False, str(e))

    def test_regular_admin_login(self) -> Optional[str]:
        """Test login with regular admin (no TOTP required)"""
        try:
            login_data = {
                "email": self.regular_admin_creds["email"],
                "password": self.regular_admin_creds["password"]
            }
            response = self.make_request("POST", "/auth/login", data=login_data, require_auth=False)
            
            if response.status_code != 200:
                self.log_test("Regular Admin Login", False, f"HTTP {response.status_code}: {response.text}")
                return None
            
            login_result = response.json()
            access_token = login_result.get("access_token")
            
            if not access_token:
                self.log_test("Regular Admin Login", False, "No access_token received")
                return None
            
            if login_result.get("requires_totp", False):
                self.log_test("Regular Admin Login", False, "Unexpected TOTP requirement for regular admin")
                return None
            
            self.log_test("Regular Admin Login", True, f"Role: {login_result.get('role')}")
            return access_token

        except Exception as e:
            self.log_test("Regular Admin Login", False, str(e))
            return None

    def test_role_based_access(self):
        """Test role-based access restrictions"""
        # Save current super admin token
        super_admin_token = self.access_token
        
        # Login as regular admin
        regular_admin_token = self.test_regular_admin_login()
        
        if regular_admin_token:
            # Test regular admin access to dashboard (should work)
            self.access_token = regular_admin_token
            try:
                response = self.make_request("GET", "/analytics/dashboard")
                if response.status_code == 200:
                    data = response.json()
                    # Check if revenue fields are present (should be for API, frontend handles hiding)
                    if "monthly_revenue" in data and "total_revenue" in data:
                        self.log_test("Regular Admin - Dashboard Access", True, "Can access dashboard with revenue data")
                    else:
                        self.log_test("Regular Admin - Dashboard Access", False, "Missing revenue fields in dashboard response")
                else:
                    self.log_test("Regular Admin - Dashboard Access", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test("Regular Admin - Dashboard Access", False, str(e))
            
            # Test regular admin access to super admin endpoints (should fail)
            try:
                response = self.make_request("GET", "/security-logs")
                if response.status_code == 403:
                    self.log_test("Regular Admin - Security Logs Restriction", True, "Correctly blocked from security logs")
                else:
                    self.log_test("Regular Admin - Security Logs Restriction", False, f"Expected 403, got {response.status_code}")
            except Exception as e:
                self.log_test("Regular Admin - Security Logs Restriction", False, str(e))
            
            # Test regular admin access to admin creation (should fail)
            try:
                test_admin_data = {
                    "email": "test@test.com",
                    "password": "TestPass123!",
                    "role": "admin",
                    "status": "active"
                }
                response = self.make_request("POST", "/admin/create", data=test_admin_data)
                if response.status_code == 403:
                    self.log_test("Regular Admin - Admin Creation Restriction", True, "Correctly blocked from creating admins")
                else:
                    self.log_test("Regular Admin - Admin Creation Restriction", False, f"Expected 403, got {response.status_code}")
            except Exception as e:
                self.log_test("Regular Admin - Admin Creation Restriction", False, str(e))
        
    def test_admin_list(self):
        """Test /api/admin/list endpoint (Super Admin only)"""
        try:
            response = self.make_request("GET", "/admin/list")
            
            if response.status_code == 200:
                admins = response.json()
                if isinstance(admins, list):
                    # Check if the list contains at least the super admin
                    super_admin_found = any(admin.get("role") == "super_admin" for admin in admins)
                    if super_admin_found:
                        self.log_test("Admin List", True, f"Found {len(admins)} admins including super admin")
                    else:
                        self.log_test("Admin List", False, "Super admin not found in admin list")
                else:
                    self.log_test("Admin List", False, "Response is not a list")
            else:
                self.log_test("Admin List", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Admin List", False, str(e))

    def run_all_tests(self):
        """Run all API tests"""
        print("=" * 60)
        print("INFINITY LOCK ADMIN PANEL - BACKEND API TESTING")
        print("=" * 60)
        print(f"Base URL: {self.base_url}")
        print(f"Testing as Super Admin: {self.super_admin_creds['email']}")
        print()

        # Test 1: Health check
        self.test_health_endpoint()

        # Test 2: Authentication flow
        auth_success = self.test_login_and_totp()
        
        if not auth_success:
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with protected endpoints")
            self.print_summary()
            return False

        # Test 3: Protected endpoints
        print("\n--- Testing Protected Endpoints ---")
        self.test_dashboard_stats()
        self.test_users_list()
        self.test_user_counts()
        self.test_feature_analytics()
        self.test_system_health()
        self.test_feedback_list()
        self.test_settings()
        
        # Test 4: Password change validations
        print("\n--- Testing Password Change API ---")
        self.test_password_change_validations()
        
        # Test 5: Super Admin only endpoints
        print("\n--- Testing Super Admin Only Endpoints ---")
        self.test_security_logs()
        self.test_admin_creation()
        self.test_admin_list()
        
        # Test 6: Role-based access control
        print("\n--- Testing Role-Based Access Control ---")
        self.test_role_based_access()

        self.print_summary()
        return True

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        success_rate = (self.test_results["passed_count"] / self.test_results["total_tests"] * 100) if self.test_results["total_tests"] > 0 else 0
        
        print(f"Total Tests: {self.test_results['total_tests']}")
        print(f"Passed: {self.test_results['passed_count']}")
        print(f"Failed: {len(self.test_results['failed'])}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()

        if self.test_results["passed"]:
            print("✅ PASSED TESTS:")
            for test in self.test_results["passed"]:
                print(f"  {test}")
        
        if self.test_results["failed"]:
            print("\n❌ FAILED TESTS:")
            for test in self.test_results["failed"]:
                print(f"  {test}")
        
        print("\n" + "=" * 60)

        # Save results to file
        results_file = "/app/test_reports/backend_api_results.json"
        try:
            with open(results_file, "w") as f:
                json.dump({
                    "timestamp": datetime.now().isoformat(),
                    "base_url": self.base_url,
                    "test_results": self.test_results,
                    "success_rate": success_rate
                }, f, indent=2)
            print(f"Results saved to: {results_file}")
        except Exception as e:
            print(f"Failed to save results: {e}")


def main():
    """Main testing function"""
    try:
        tester = InfinityLockAPITester()
        success = tester.run_all_tests()
        return 0 if success and tester.test_results["failed"] == [] else 1
    except KeyboardInterrupt:
        print("\n\nTesting interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())