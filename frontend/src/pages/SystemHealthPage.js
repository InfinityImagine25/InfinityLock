/**
 * System Health Page for Infinity Lock Admin Panel
 */
import { useState, useEffect } from 'react';
import { analyticsAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
    Activity,
    Database,
    Clock,
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    Gauge,
    Shield,
    Users,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SystemHealthPage() {
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchHealth = async () => {
        try {
            const response = await analyticsAPI.getSystemHealth();
            setHealth(response.data);
        } catch (error) {
            console.error('Failed to fetch health:', error);
            toast.error('Failed to load system health');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchHealth();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchHealth();
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="system-loading">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-40 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    const isHealthy = health?.db_status === 'healthy' && health?.error_rate < 5;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="system-page">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold tracking-tight">System Health</h1>
                    <p className="text-slate-400">Monitor API performance and system status</p>
                </div>
                <div className="flex items-center gap-4">
                    <Badge 
                        variant="outline" 
                        className={isHealthy 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }
                    >
                        {isHealthy ? (
                            <CheckCircle className="w-3 h-3 mr-1" />
                        ) : (
                            <AlertTriangle className="w-3 h-3 mr-1" />
                        )}
                        {isHealthy ? 'All Systems Operational' : 'Issues Detected'}
                    </Badge>
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="border-white/10"
                        data-testid="refresh-health-btn"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Health Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Database Status */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                    health?.db_status === 'healthy' 
                                        ? 'bg-emerald-500/10' 
                                        : 'bg-red-500/10'
                                }`}>
                                    <Database className={`w-6 h-6 ${
                                        health?.db_status === 'healthy' 
                                            ? 'text-emerald-500' 
                                            : 'text-red-500'
                                    }`} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Database</p>
                                    <p className="font-medium capitalize">{health?.db_status || 'Unknown'}</p>
                                </div>
                            </div>
                            <span className={`status-dot ${health?.db_status === 'healthy' ? 'active' : 'deactivated'}`} />
                        </div>
                        <p className="text-xs text-slate-500">MongoDB connection status</p>
                    </CardContent>
                </Card>

                {/* API Latency */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Gauge className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">API Latency</p>
                                <p className="text-2xl font-heading font-bold font-mono">
                                    {health?.api_latency_ms || 0}
                                    <span className="text-sm font-normal text-slate-400 ml-1">ms</span>
                                </p>
                            </div>
                        </div>
                        <Progress 
                            value={Math.min((health?.api_latency_ms || 0) / 100 * 100, 100)} 
                            className="h-2"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            {health?.api_latency_ms < 50 ? 'Excellent' : health?.api_latency_ms < 100 ? 'Good' : 'Slow'}
                        </p>
                    </CardContent>
                </Card>

                {/* Error Rate */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                health?.error_rate < 2 ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                            }`}>
                                <AlertTriangle className={`w-6 h-6 ${
                                    health?.error_rate < 2 ? 'text-emerald-500' : 'text-amber-500'
                                }`} />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Error Rate</p>
                                <p className="text-2xl font-heading font-bold font-mono">
                                    {health?.error_rate || 0}
                                    <span className="text-sm font-normal text-slate-400 ml-1">%</span>
                                </p>
                            </div>
                        </div>
                        <Progress 
                            value={health?.error_rate || 0} 
                            className={`h-2 ${health?.error_rate < 2 ? '[&>div]:bg-emerald-500' : '[&>div]:bg-amber-500'}`}
                        />
                        <p className="text-xs text-slate-500 mt-2">Last hour</p>
                    </CardContent>
                </Card>

                {/* Auth Success Rate */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <Shield className="w-6 h-6 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Auth Success Rate</p>
                                <p className="text-2xl font-heading font-bold font-mono">
                                    {health?.auth_success_rate || 0}
                                    <span className="text-sm font-normal text-slate-400 ml-1">%</span>
                                </p>
                            </div>
                        </div>
                        <Progress 
                            value={health?.auth_success_rate || 0} 
                            className="h-2 [&>div]:bg-emerald-500"
                        />
                        <p className="text-xs text-slate-500 mt-2">Authentication requests</p>
                    </CardContent>
                </Card>

                {/* Active Sessions */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                <Users className="w-6 h-6 text-purple-500" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Active Sessions</p>
                                <p className="text-2xl font-heading font-bold font-mono">
                                    {health?.active_sessions || 0}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">Currently logged in admins</p>
                    </CardContent>
                </Card>

                {/* Last Checked */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-slate-500/10 flex items-center justify-center">
                                <Clock className="w-6 h-6 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Last Checked</p>
                                <p className="font-medium font-mono text-sm">
                                    {health?.last_checked 
                                        ? new Date(health.last_checked).toLocaleTimeString()
                                        : 'Unknown'
                                    }
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">Auto-refreshes every 30 seconds</p>
                    </CardContent>
                </Card>
            </div>

            {/* System Info */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="w-5 h-5 text-slate-400" />
                        System Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">API Version</p>
                            <p className="font-mono">v1.0.0</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Backend</p>
                            <p className="font-mono">FastAPI</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Database</p>
                            <p className="font-mono">MongoDB</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Environment</p>
                            <p className="font-mono">Production</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
