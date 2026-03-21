/**
 * Notifications Bell Component with Real-Time Updates
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { notificationsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Bell,
    AlertTriangle,
    UserPlus,
    ShieldAlert,
    Settings,
    CheckCircle,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const notificationIcons = {
    alert: AlertTriangle,
    action: Settings,
    user: UserPlus,
    security: ShieldAlert,
};

const severityColors = {
    warning: 'text-amber-500 bg-amber-500/10',
    error: 'text-red-500 bg-red-500/10',
    info: 'text-primary bg-primary/10',
    success: 'text-emerald-500 bg-emerald-500/10',
};

export default function NotificationsBell() {
    const { isSuperAdmin, isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const eventSourceRef = useRef(null);

    // Fetch initial notifications
    useEffect(() => {
        if (!isSuperAdmin || !isAuthenticated) return;

        const fetchNotifications = async () => {
            try {
                const response = await notificationsAPI.getNotifications({ limit: 10 });
                setNotifications(response.data.notifications || []);
                setUnreadCount(response.data.unread_count || 0);
            } catch (error) {
                console.error('Failed to fetch notifications:', error);
            }
        };

        fetchNotifications();
    }, [isSuperAdmin, isAuthenticated]);

    // Set up SSE connection for real-time updates
    useEffect(() => {
        if (!isSuperAdmin || !isAuthenticated) return;

        const token = localStorage.getItem('adminToken');
        if (!token) return;

        const connectSSE = () => {
            const url = `${BACKEND_URL}/api/notifications/stream`;
            
            // Use fetch with Authorization header for SSE
            const eventSource = new EventSource(url);
            
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'heartbeat') return;
                    
                    // Add new notification to list
                    setNotifications(prev => [data, ...prev.slice(0, 9)]);
                    setUnreadCount(prev => prev + 1);
                    
                    // Show toast for important notifications
                    if (data.severity === 'warning' || data.severity === 'error') {
                        toast.warning(data.title, {
                            description: data.details?.email || data.event_type,
                        });
                    }
                } catch (e) {
                    console.error('Failed to parse SSE message:', e);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                eventSource.close();
                // Reconnect after 5 seconds
                setTimeout(connectSSE, 5000);
            };

            eventSourceRef.current = eventSource;
        };

        connectSSE();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, [isSuperAdmin, isAuthenticated]);

    const handleMarkAllRead = async () => {
        try {
            await notificationsAPI.markAsRead();
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (error) {
            console.error('Failed to mark notifications as read:', error);
        }
    };

    const handleClearAll = () => {
        setNotifications([]);
        setUnreadCount(0);
    };

    // Only show for Super Admin
    if (!isSuperAdmin) return null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    data-testid="notifications-bell"
                >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white animate-pulse">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="w-80 p-0 bg-card border-white/10" 
                align="end"
                data-testid="notifications-panel"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-white/5">
                    <h3 className="font-medium text-sm">Notifications</h3>
                    <div className="flex gap-1">
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleMarkAllRead}
                            >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Mark all read
                            </Button>
                        )}
                    </div>
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-6 text-center text-slate-500">
                            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No notifications</p>
                        </div>
                    ) : (
                        notifications.map((notification, index) => {
                            const Icon = notificationIcons[notification.type] || Bell;
                            const colorClass = severityColors[notification.severity] || severityColors.info;
                            
                            return (
                                <div
                                    key={notification.id || index}
                                    className={`p-3 border-b border-white/5 hover:bg-white/2 transition-colors ${
                                        !notification.read ? 'bg-primary/5' : ''
                                    }`}
                                >
                                    <div className="flex gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {notification.title}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {notification.details?.email || notification.event_type}
                                            </p>
                                            <p className="text-[10px] text-slate-600 mt-1">
                                                {notification.timestamp 
                                                    ? new Date(notification.timestamp).toLocaleString()
                                                    : 'Just now'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                    <div className="p-2 border-t border-white/5">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-slate-400"
                            onClick={handleClearAll}
                        >
                            Clear all
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
