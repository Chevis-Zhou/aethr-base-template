import {
  Palette,
  Code,
  BarChart3,
  Users,
  Globe,
  Shield,
  Zap,
  Heart,
  Star,
  Settings,
  MessageSquare,
  TrendingUp,
  Briefcase,
  Camera,
  PenTool,
  Layers,
  Monitor,
  Smartphone,
  Mail,
  DollarSign,
  Award,
  BadgeCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// Shared by `services`, `feature-list` and `credentials`: the closed icon vocabulary a
// spec may name. An unknown or absent name falls back to the caller's default — Sparkles
// everywhere except `credentials`, which passes BadgeCheck.
export const ICON_MAP: Record<string, LucideIcon> = {
  Palette,
  Code,
  BarChart3,
  Users,
  Globe,
  Shield,
  Zap,
  Heart,
  Star,
  Settings,
  MessageSquare,
  TrendingUp,
  Briefcase,
  Camera,
  PenTool,
  Layers,
  Monitor,
  Smartphone,
  Mail,
  DollarSign,
  // Added with `credentials` — the vocabulary a licence or accreditation actually needs.
  Award,
  BadgeCheck,
};

export { Sparkles as FallbackIcon };

/**
 * `fallback` exists for `credentials`, where the shared Sparkles default is actively
 * wrong: a decorative sparkle beside a state licence undercuts the one thing the section
 * is claiming. Everything else omits it and gets Sparkles as before.
 */
export function resolveIcon(name?: string, fallback: LucideIcon = Sparkles): LucideIcon {
  return (name && ICON_MAP[name]) || fallback;
}
