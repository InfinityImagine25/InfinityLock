/**
 * Dashboard Page for Infinity Lock Admin Panel
 */
import { useState, useEffect } from 'react';
import { analyticsAPI, usersAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Users,
    UserCheck,
    UserMinus,
    Crown,
    TrendingUp,
    DollarSign,
    Activity,
    Smartphone,
    Lock,
} from 'lucide-react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { toast } from 'sonner';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'primary' }) {
    const colorClasses = {
        primary: 'bg-primary/10 text-primary',
        success: 'bg-emerald-500/10 text-emerald-500',
        warning: 'bg-amber-500/10 text-amber-500',
        destructive: 'bg-red-500/10 text-red-500',
    };

    return (
        <Card className="bg-card/50 backdrop-blur-md border-white/5 hover:border-white/10 transition-colors">
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm text-slate-400 mb-1">{title}</p>
                        <p className="text-3xl font-heading font-bold font-mono">{value}</p>
                        {subtitle && (
                            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
                        )}
                        {trend && (
                            <div className="flex items-center gap-1 mt-2">
                                <TrendingUp className="w-3 h-3 text-emerald-500" />
                                <span className="text-xs text-emerald-500">{trend}</span>
                            </div>
                        )}
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
                        <Icon className="w-6 h-6" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function ChartCard({ title, children, className = '' }) {
    return (
        <Card className={`bg-card/50 backdrop-blur-md border-white/5 ${className}`}>
            <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-base font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                {children}
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
    const { isSuperAdmin } = useAuth();
    const [stats, setStats] = useState(null);
    const [trend, setTrend] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [dashboardRes, trendRes] = await Promise.all([
                    analyticsAPI.getDashboard(),
                    analyticsAPI.getInstallationTrend(30),
                ]);
                setStats(dashboardRes.data);
                setTrend(trendRes.data);
            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
                toast.error('Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="dashboard-loading">
                <div>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Skeleton className="h-80 rounded-xl" />
                    <Skeleton className="h-80 rounded-xl" />
                </div>
            </div>
        );
    }

    const planData = [
        { name: 'Classic', value: stats?.classic_users || 0, color: CHART_COLORS[0] },
        { name: 'Premium', value: stats?.premium_users || 0, color: CHART_COLORS[1] },
    ];

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-heading font-bold tracking-tight">Dashboard</h1>
                <p className="text-slate-400">Overview of Infinity Lock metrics and performance</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Installations"
                    value={stats?.total_installations?.toLocaleString() || 0}
                    icon={Smartphone}
                    color="primary"
                    trend="+12% this month"
                    data-testid="stat-total-installations"
                />
                <StatCard
                    title="Active Users"
                    value={stats?.active_users?.toLocaleString() || 0}
                    icon={UserCheck}
                    color="success"
                    subtitle={`${stats?.total_uninstalls || 0} uninstalled`}
                />
                <StatCard
                    title="Premium Users"
                    value={stats?.premium_users?.toLocaleString() || 0}
                    icon={Crown}
                    color="warning"
                    subtitle={`${stats?.premium_conversion_rate || 0}% conversion`}
                />
                {/* Revenue Card - Super Admin Only */}
                {isSuperAdmin ? (
                    <StatCard
                        title="Monthly Revenue"
                        value={`₹${(stats?.monthly_revenue || 0).toLocaleString()}`}
                        icon={DollarSign}
                        color="success"
                        subtitle={`₹${(stats?.total_revenue || 0).toLocaleString()} total`}
                    />
                ) : (
                    <Card className="bg-card/50 backdrop-blur-md border-white/5 hover:border-white/10 transition-colors">
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm text-slate-400 mb-1">Monthly Revenue</p>
                                    <p className="text-lg text-slate-500">Restricted</p>
                                    <p className="text-xs text-slate-600 mt-1">Super Admin access only</p>
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-slate-500/10 flex items-center justify-center">
                                    <Lock className="w-6 h-6 text-slate-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Installation Trend */}
                <ChartCard title="Installation Trend (30 Days)" className="lg:col-span-2">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend}>
                                <defs>
                                    <linearGradient id="installGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#64748b" 
                                    fontSize={11}
                                    tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                />
                                <YAxis stroke="#64748b" fontSize={11} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#101012',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="installations"
                                    stroke="#3B82F6"
                                    fillOpacity={1}
                                    fill="url(#installGradient)"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="uninstalls"
                                    stroke="#EF4444"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Plan Distribution */}
                <ChartCard title="Plan Distribution">
                    <div className="h-72 flex flex-col items-center justify-center">
                        <ResponsiveContainer width="100%" height="80%">
                            <PieChart>
                                <Pie
                                    data={planData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {planData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#101012',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex gap-6">
                            {planData.map((entry) => (
                                <div key={entry.name} className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-sm text-slate-400">{entry.name}</span>
                                    <span className="text-sm font-mono font-medium">{entry.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </ChartCard>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium">Uninstall Metrics</h3>
                            <UserMinus className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-400">This Week</span>
                                <Badge variant="destructive" className="font-mono">
                                    {stats?.uninstalls_this_week || 0}
                                </Badge>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-400">This Month</span>
                                <Badge variant="outline" className="font-mono border-white/10">
                                    {stats?.uninstalls_this_month || 0}
                                </Badge>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-400">Total</span>
                                <Badge variant="secondary" className="font-mono">
                                    {stats?.total_uninstalls || 0}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium">Conversion Rate</h3>
                            <TrendingUp className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="text-4xl font-heading font-bold text-emerald-500 mb-2">
                            {stats?.premium_conversion_rate || 0}%
                        </div>
                        <p className="text-sm text-slate-400">
                            {stats?.premium_users || 0} of {stats?.total_installations || 0} users upgraded to Premium
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium">Revenue</h3>
                            <DollarSign className="w-5 h-5 text-amber-500" />
                        </div>
                        {isSuperAdmin ? (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Monthly</span>
                                    <span className="font-mono font-medium text-emerald-500">
                                        ₹{(stats?.monthly_revenue || 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Projected Annual</span>
                                    <span className="font-mono font-medium">
                                        ₹{((stats?.monthly_revenue || 0) * 12).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Total Earned</span>
                                    <span className="font-mono font-medium text-primary">
                                        ₹{(stats?.total_revenue || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-4 text-center">
                                <Lock className="w-8 h-8 text-slate-500 mb-2" />
                                <p className="text-sm text-slate-500">Super Admin access only</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
