/**
 * Authentication Context for Infinity Lock Admin Panel
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Check auth status on mount
    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('adminToken');
            if (token) {
                try {
                    const response = await authAPI.getCurrentUser();
                    setUser(response.data);
                    setIsAuthenticated(true);
                } catch (error) {
                    console.error('Auth check failed:', error);
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('adminUser');
                }
            }
            setLoading(false);
        };
        checkAuth();
    }, []);

    const login = useCallback(async (email, password) => {
        const response = await authAPI.login(email, password);
        const data = response.data;
        
        if (data.requires_totp) {
            // Return temp token for TOTP step
            return { requiresTotp: true, tempToken: data.temp_token, email };
        }
        
        // Direct login (no TOTP required)
        localStorage.setItem('adminToken', data.access_token);
        
        const userResponse = await authAPI.getCurrentUser();
        setUser(userResponse.data);
        setIsAuthenticated(true);
        localStorage.setItem('adminUser', JSON.stringify(userResponse.data));
        
        return { requiresTotp: false };
    }, []);

    const verifyTotp = useCallback(async (email, totpCode, tempToken) => {
        const response = await authAPI.verifyTotp(email, totpCode, tempToken);
        const data = response.data;
        
        localStorage.setItem('adminToken', data.access_token);
        
        const userResponse = await authAPI.getCurrentUser();
        setUser(userResponse.data);
        setIsAuthenticated(true);
        localStorage.setItem('adminUser', JSON.stringify(userResponse.data));
        
        return true;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        setUser(null);
        setIsAuthenticated(false);
    }, []);

    const value = {
        user,
        loading,
        isAuthenticated,
        isSuperAdmin: user?.role === 'super_admin',
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        login,
        verifyTotp,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
