/**
 * Admin Layout with Sidebar for Infinity Lock Admin Panel
 */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Shield,
    LayoutDashboard,
    Users,
    BarChart3,
    MessageSquare,
    Activity,
    Settings,
    LogOut,
    ChevronLeft,
    Menu,
    User,
    ShieldCheck,
    FileText,
    UserCog,
    KeyRound,
    Sun,
    Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import NotificationsBell from '@/components/NotificationsBell';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/users', label: 'Users', icon: Users },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/feedback', label: 'Feedback', icon: MessageSquare },
    { path: '/system', label: 'System Health', icon: Activity },
    { path: '/admins', label: 'Admins', icon: UserCog, superAdminOnly: true },
    { path: '/security-logs', label: 'Security Logs', icon: FileText, superAdminOnly: true },
    { path: '/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
    const navigate = useNavigate();
    const { user, logout, isSuperAdmin } = useAuth();
    const { theme, toggleTheme, isDark } = useTheme();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredNavItems = navItems.filter(
        item => !item.superAdminOnly || isSuperAdmin
    );

    const SidebarContent = () => (
        <>
            {/* Logo */}
            <div className="p-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                        <img src="/infinity-lock-icon.png" alt="Infinity Lock" className="w-full h-full object-cover" />
                    </div>
                    {!collapsed && (
                        <div className="overflow-hidden">
                            <h1 className="font-heading font-bold text-sm tracking-tight truncate">INFINITY LOCK</h1>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Admin Panel</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {filteredNavItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                                'hover:bg-white/5 group',
                                isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-slate-400'
                            )
                        }
                        data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                    >
                        <item.icon className={cn('w-5 h-5 shrink-0', collapsed && 'mx-auto')} />
                        {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                    </NavLink>
                ))}
            </nav>

            {/* User Section */}
            <div className="p-3 border-t border-white/5">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start gap-3 px-3 py-2.5 h-auto hover:bg-white/5',
                                collapsed && 'justify-center px-0'
                            )}
                            data-testid="user-menu-trigger"
                        >
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                <User className="w-4 h-4 text-primary" />
                            </div>
                            {!collapsed && (
                                <div className="text-left overflow-hidden">
                                    <p className="text-sm font-medium truncate">{user?.email?.split('@')[0]}</p>
                                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3" />
                                        {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                                    </p>
                                </div>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-card border-white/10">
                        <div className="px-2 py-1.5">
                            <p className="text-sm font-medium">{user?.email}</p>
                            <p className="text-xs text-slate-500">{user?.role}</p>
                        </div>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem 
                            onClick={() => {
                                setMobileOpen(false);
                                navigate('/profile');
                            }}
                            className="cursor-pointer"
                            data-testid="profile-btn"
                        >
                            <KeyRound className="w-4 h-4 mr-2" />
                            Account Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem 
                            onClick={handleLogout}
                            className="text-destructive focus:text-destructive cursor-pointer"
                            data-testid="logout-btn"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Sign Out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-[#0A0A0B] flex" data-testid="admin-layout">
            {/* Desktop Sidebar */}
            <aside
                className={cn(
                    'hidden lg:flex flex-col bg-[#050505] border-r border-white/5 transition-all duration-300',
                    collapsed ? 'w-[72px]' : 'w-[260px]'
                )}
            >
                <SidebarContent />
                
                {/* Collapse Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-[calc(var(--sidebar-width)-16px)] top-6 w-8 h-8 rounded-full bg-card border border-white/10 hover:bg-white/5 hidden lg:flex"
                    style={{ '--sidebar-width': collapsed ? '72px' : '260px' }}
                    onClick={() => setCollapsed(!collapsed)}
                    data-testid="collapse-sidebar-btn"
                >
                    <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
                </Button>
            </aside>

            {/* Mobile Sidebar Overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 w-[260px] bg-[#050505] border-r border-white/5 lg:hidden',
                    'transform transition-transform duration-300',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                {/* Desktop Header with Notifications */}
                <header className="hidden lg:flex items-center justify-end gap-3 p-4 border-b border-white/5 bg-[#050505]/50">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTheme}
                        className="h-9 w-9 rounded-full"
                        data-testid="theme-toggle-btn"
                    >
                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </Button>
                    <NotificationsBell />
                </header>

                {/* Mobile Header */}
                <header className="lg:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#050505]">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMobileOpen(true)}
                        data-testid="mobile-menu-btn"
                    >
                        <Menu className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <img src="/infinity-lock-icon.png" alt="Infinity Lock" className="w-6 h-6 rounded" />
                        <span className="font-heading font-bold text-sm">INFINITY LOCK</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8" data-testid="theme-toggle-mobile-btn">
                            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>
                        <NotificationsBell />
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-4 lg:p-6">
                    <div className="max-w-[1600px] mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
