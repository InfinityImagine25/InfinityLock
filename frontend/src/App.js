/**
 * Infinity Lock Admin Panel - Main App
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Toaster } from '@/components/ui/sonner';

// Layout
import AdminLayout from '@/components/AdminLayout';

// Pages
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import FeedbackPage from '@/pages/FeedbackPage';
import SystemHealthPage from '@/pages/SystemHealthPage';
import SecurityLogsPage from '@/pages/SecurityLogsPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminsPage from '@/pages/AdminsPage';
import ProfilePage from '@/pages/ProfilePage';

// Protected Route Component
function ProtectedRoute({ children, requireSuperAdmin = false }) {
    const { isAuthenticated, loading, isSuperAdmin } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requireSuperAdmin && !isSuperAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}

// Public Route (redirect if authenticated)
function PublicRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}

function AppRoutes() {
    return (
        <Routes>
            {/* Public Routes */}
            <Route
                path="/login"
                element={
                    <PublicRoute>
                        <LoginPage />
                    </PublicRoute>
                }
            />

            {/* Protected Routes with Admin Layout */}
            <Route
                element={
                    <ProtectedRoute>
                        <AdminLayout />
                    </ProtectedRoute>
                }
            >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
                <Route path="/system" element={<SystemHealthPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                
                {/* Super Admin Only */}
                <Route
                    path="/security-logs"
                    element={
                        <ProtectedRoute requireSuperAdmin>
                            <SecurityLogsPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admins"
                    element={
                        <ProtectedRoute requireSuperAdmin>
                            <AdminsPage />
                        </ProtectedRoute>
                    }
                />
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <AppRoutes />
                    <Toaster 
                        position="top-right" 
                        toastOptions={{
                            style: {
                                background: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                color: 'hsl(var(--foreground))',
                            },
                        }}
                    />
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}

export default App;
