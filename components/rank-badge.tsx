"use client"

import React from "react"
import { ShieldCheck, ShieldAlert, Cpu, Award, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

export type HackerRank = 'Script Kiddie' | 'Apprentice' | 'Senior Dev' | 'Architect' | 'Legendary Hacker'

interface RankBadgeProps {
  rank: string | HackerRank
  className?: string
  showLabel?: boolean
}

export function RankBadge({ rank, className, showLabel = true }: RankBadgeProps) {
  const rankStyles: Record<string, { icon: any, color: string, bg: string, border: string }> = {
    'Script Kiddie': {
      icon: Cpu,
      color: 'text-slate-400',
      bg: 'bg-slate-500/10',
      border: 'border-slate-500/20'
    },
    'Apprentice': {
      icon: Zap,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20'
    },
    'Senior Dev': {
      icon: ShieldCheck,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20'
    },
    'Architect': {
      icon: Award,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20'
    },
    'Legendary Hacker': {
      icon: ShieldAlert,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
    }
  }

  const config = rankStyles[rank] || rankStyles['Script Kiddie']
  const Icon = config.icon

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-tight",
      config.bg,
      config.color,
      config.border,
      className
    )}>
      <Icon className="h-3 w-3" />
      {showLabel && <span>{rank}</span>}
    </div>
  )
}
