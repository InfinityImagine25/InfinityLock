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
    
    getCurrentUser: () =>
        api.get('/auth/me'),
};

// Admin Management APIs
export const adminAPI = {
    listAdmins: () => 
        api.get('/admin/list'),
    
    createAdmin: (data) =>
        api.post('/admin/create', data),
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
};

// Health check
export const healthCheck = () => api.get('/health');

export default api;
