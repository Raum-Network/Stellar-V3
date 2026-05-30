"use client";

import React from "react";
import {
    AreaChart,
    Area,
    ResponsiveContainer,
    YAxis,
    Tooltip,
} from "recharts";

interface PriceChartProps {
    id?: string;
    color?: string;
    data?: { time: string; price: number }[];
}

export const PriceChart = ({ id = 'stellar', color = "#b08d57", data = [] }: PriceChartProps) => {
    if (!data.length) return <div className="w-full h-full bg-white/5 animate-pulse" />;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <defs>
                    <linearGradient id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            return (
                                <div className="lux-card p-2 border-[var(--border)] bg-[var(--background)] shadow-xl">
                                    <p className="text-[8px] font-mono text-[var(--muted)]">{payload[0].payload.time}</p>
                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)]">${Number(payload[0].value).toFixed(4)}</p>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="price"
                    stroke={color}
                    fillOpacity={1}
                    fill={`url(#gradient-${id})`}
                    strokeWidth={2}
                    isAnimationActive={true}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
