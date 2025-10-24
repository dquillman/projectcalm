/* @jsxRuntime classic */
/* @jsx React.createElement */
import { componentStyles, getPriorityTone, getDifficultyTone } from '../lib/theme';

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Badge component for status indicators with consistent styling
 */
export function ImprovedBadge({ children, tone = 'neutral', size = 'sm', className = '' }: BadgeProps) {
  const baseClass = componentStyles.badge.base;
  const toneClass = componentStyles.badge.tones[tone];
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`${baseClass} ${toneClass} ${sizeClass} ${className}`}>
      {children}
    </span>
  );
}

/**
 * Priority badge with semantic coloring
 */
export function PriorityBadge({ priority }: { priority: number }) {
  const tone = getPriorityTone(priority);
  const labels = ['Critical', 'High', 'Medium', 'Low', 'Trivial'];
  const label = labels[priority - 1] || 'Medium';

  return (
    <ImprovedBadge tone={tone} className="font-medium">
      P{priority}
    </ImprovedBadge>
  );
}

/**
 * Difficulty badge with semantic coloring
 */
export function DifficultyBadge({ difficulty }: { difficulty: number }) {
  const tone = getDifficultyTone(difficulty);

  return (
    <ImprovedBadge tone={tone} className="font-medium">
      D{difficulty}
    </ImprovedBadge>
  );
}

/**
 * Days until due badge with dynamic coloring
 */
export function DueBadge({ daysUntil }: { daysUntil: number }) {
  let tone: 'success' | 'warning' | 'danger' = 'success';

  if (daysUntil < 0) tone = 'danger';
  else if (daysUntil === 0) tone = 'danger';
  else if (daysUntil <= 2) tone = 'warning';
  else if (daysUntil <= 7) tone = 'info';

  const text = daysUntil < 0
    ? `${Math.abs(daysUntil)}d overdue`
    : daysUntil === 0
    ? 'Due today'
    : `${daysUntil}d left`;

  return <ImprovedBadge tone={tone}>{text}</ImprovedBadge>;
}
