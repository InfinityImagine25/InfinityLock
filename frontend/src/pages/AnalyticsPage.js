/**
 * Analytics Page for Infinity Lock Admin Panel
 */
import { useState, useEffect } from 'react';
import { analyticsAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
    Fingerprint,
    ScanFace,
    Camera,
    Shield,
    Globe,
    Languages,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function AnalyticsPage() {
    const [features, setFeatures] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await analyticsAPI.getFeatures();
                setFeatures(response.data);
            } catch (error) {
                console.error('Failed to fetch analytics:', error);
                toast.error('Failed to load analytics');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="analytics-loading">
                <Skeleton className="h-8 w-32" />
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

    const languageData = Object.entries(features?.language_distribution || {}).map(([name, value]) => ({
        name: name.toUpperCase(),
        value,
    })).sort((a, b) => b.value - a.value).slice(0, 8);

    const countryData = Object.entries(features?.country_distribution || {}).map(([name, value]) => ({
        name,
        value,
    })).sort((a, b) => b.value - a.value).slice(0, 8);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="analytics-page">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-heading font-bold tracking-tight">Feature Analytics</h1>
                <p className="text-slate-400">Usage statistics and feature adoption metrics</p>
            </div>

            {/* Feature Adoption Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Fingerprint className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Biometric Unlock</p>
                                <p className="text-2xl font-heading font-bold">
                                    {features?.biometric_adoption_rate || 0}%
                                </p>
                            </div>
                        </div>
                        <Progress value={features?.biometric_adoption_rate || 0} className="h-2" />
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <ScanFace className="w-6 h-6 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Face Unlock</p>
                                <p className="text-2xl font-heading font-bold">
                                    {features?.face_unlock_adoption_rate || 0}%
                                </p>
                            </div>
                        </div>
                        <Progress value={features?.face_unlock_adoption_rate || 0} className="h-2 [&>div]:bg-emerald-500" />
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <Camera className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Intruder Selfie</p>
                                <p className="text-2xl font-heading font-bold">
                                    {features?.intruder_selfie_usage || 0}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">Premium users with feature enabled</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                <Shield className="w-6 h-6 text-purple-500" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">Avg Secured Apps</p>
                                <p className="text-2xl font-heading font-bold">
                                    {features?.avg_secured_apps || 0}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">Apps protected per user</p>
                    </CardContent>
                </Card>
            </div>

            {/* Distribution Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Language Distribution */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardHeader className="border-b border-white/5">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Languages className="w-5 h-5 text-slate-400" />
                            Language Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={languageData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis type="number" stroke="#64748b" fontSize={11} />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        stroke="#64748b" 
                                        fontSize={11}
                                        width={50}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#101012',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                        }}
                                    />
                                    <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Country Distribution */}
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardHeader className="border-b border-white/5">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Globe className="w-5 h-5 text-slate-400" />
                            Country Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={countryData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        labelLine={false}
                                    >
                                        {countryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
                        </div>
                        <div className="flex flex-wrap justify-center gap-4 mt-4">
                            {countryData.slice(0, 5).map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                    />
                                    <span className="text-xs text-slate-400">{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
