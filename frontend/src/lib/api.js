/**
 * API Service for Infinity Lock Admin Panel
 */
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth APIs
export const authAPI = {
    login: (email, password) => 
        api.post('/auth/login', { email, password }),
    
    verifyTotp: (email, totp_code, temp_token) =>
        api.post('/auth/verify-totp', { email, totp_code, temp_token }),
    
    getTotpSetup: () =>
        api.get('/auth/totp-setup'),
    
    enableTotp: (totp_code) =>
        api.post(`/auth/enable-totp?totp_code=${totp_code}`),
    
    changePassword: (current_password, new_password) =>
        api.post(`/auth/change-password?current_password=${encodeURIComponent(current_password)}&new_password=${encodeURIComponent(new_password)}`),
    
    getCurrentUser: () =>
        api.get('/auth/me'),
};

// Admin Management APIs
export const adminAPI = {
    listAdmins: () => 
        api.get('/admin/list'),
    
    createAdmin: (data) =>
        api.post('/admin/create', data),
    
    updateAdmin: (adminId, data) =>
        api.put(`/admin/${adminId}`, data),
    
    deleteAdmin: (adminId) =>
        api.delete(`/admin/${adminId}`),
    
    resetTotp: (adminId) =>
        api.post(`/admin/${adminId}/reset-totp`),
};

// User Management APIs
export const usersAPI = {
    listUsers: (params = {}) =>
        api.get('/users/list', { params }),
    
    getUserCounts: () =>
        api.get('/users/count'),
    
    userAction: (user_id, action, reason = null) =>
        api.post('/users/action', { user_id, action, reason }),
};

// Analytics APIs
export const analyticsAPI = {
    getDashboard: () =>
        api.get('/analytics/dashboard'),
    
    getFeatures: () =>
        api.get('/analytics/features'),
    
    getSystemHealth: () =>
        api.get('/analytics/system-health'),
    
    getInstallationTrend: (days = 30) =>
        api.get(`/analytics/installation-trend?days=${days}`),
};

// Feedback APIs
export const feedbackAPI = {
    listFeedback: (params = {}) =>
        api.get('/feedback/list', { params }),
    
    respondToFeedback: (feedback_id, response_text) =>
        api.post(`/feedback/${feedback_id}/respond?response_text=${encodeURIComponent(response_text)}`),
    
    getFeedbackStats: () =>
        api.get('/feedback/stats'),
};

// Settings APIs
export const settingsAPI = {
    getSettings: () =>
        api.get('/settings/'),
    
    updateSettings: (data) =>
        api.put('/settings/', data),
};

// Security Logs APIs
export const securityAPI = {
    getLogs: (params = {}) =>
        api.get('/security-logs', { params }),
    
    getLogsCount: (params = {}) =>
        api.get('/security-logs/count', { params }),
};

// Export APIs (Super Admin only)
export const exportAPI = {
    downloadSecurityLogsCSV: () =>
        api.get('/export/security-logs/csv', { responseType: 'blob' }),
    
    downloadIntrusionLogsCSV: () =>
        api.get('/export/intrusion-logs/csv', { responseType: 'blob' }),
    
    downloadUsersCSV: () =>
        api.get('/export/users/csv', { responseType: 'blob' }),
    
    downloadSecurityLogsPDF: () =>
        api.get('/export/security-logs/pdf', { responseType: 'blob' }),
    
    downloadUsersPDF: () =>
        api.get('/export/users/pdf', { responseType: 'blob' }),
};

// Notifications APIs (Super Admin only)
export const notificationsAPI = {
    getNotifications: (params = {}) =>
        api.get('/notifications/', { params }),
    
    markAsRead: (notification_ids = null) =>
        api.post('/notifications/mark-read', notification_ids ? { notification_ids } : {}),
    
    // SSE stream URL
    getStreamUrl: () => `${API_BASE}/notifications/stream`,
};

// Email OTP APIs
export const otpAPI = {
    sendOTP: (email, purpose = 'verification') =>
        api.post(`/auth/send-otp?email=${encodeURIComponent(email)}&purpose=${purpose}`),
    
    verifyOTP: (email, otp_code) =>
        api.post(`/auth/verify-email-otp?email=${encodeURIComponent(email)}&otp_code=${otp_code}`),
};

// Forgot Password APIs
export const forgotPasswordAPI = {
    requestReset: (email) =>
        api.post(`/auth/forgot-password/request?email=${encodeURIComponent(email)}`),
    
    verifyOtp: (email, otp_code) =>
        api.post(`/auth/forgot-password/verify-otp?email=${encodeURIComponent(email)}&otp_code=${otp_code}`),
    
    verifyTotp: (email, totp_code, reset_token) =>
        api.post(`/auth/forgot-password/verify-totp?email=${encodeURIComponent(email)}&totp_code=${totp_code}&reset_token=${reset_token}`),
    
    resetPassword: (email, new_password, reset_token) =>
        api.post(`/auth/forgot-password/reset?email=${encodeURIComponent(email)}&new_password=${encodeURIComponent(new_password)}&reset_token=${reset_token}`),
};

// Change Email APIs (Super Admin only)
export const changeEmailAPI = {
    verify: (new_email, current_password) =>
        api.post(`/auth/change-email/verify?new_email=${encodeURIComponent(new_email)}&current_password=${encodeURIComponent(current_password)}`),
    
    confirm: (totp_code, change_token) =>
        api.post(`/auth/change-email/confirm?totp_code=${totp_code}&change_token=${change_token}`),
};

// Health check
export const healthCheck = () => api.get('/health');

export default api;
