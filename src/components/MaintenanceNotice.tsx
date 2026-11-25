import React from 'react';
import { ArrowLeft, Wrench } from 'lucide-react';

export const MAINTENANCE_HEADING = 'GHAD AI Is Temporarily Under Maintenance';
export const MAINTENANCE_BODY =
  'We are currently improving GHAD AI to provide you with a better experience. AI generation services are temporarily unavailable. Please check back soon. Thank you for your patience.';

interface MaintenanceNoticeProps {
  variant?: 'homepage' | 'workspace';
  onReturnHome?: () => void;
  className?: string;
}

export const MaintenanceNotice: React.FC<MaintenanceNoticeProps> = ({
  variant = 'workspace',
  onReturnHome,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-print holo-glass holo-reticle rounded-2xl border border-amber-500/45 bg-gradient-to-br from-amber-500/12 via-amber-500/6 to-sky-500/5 p-5 sm:p-6 shadow-md ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/35 text-amber-600 dark:text-amber-300 grid place-items-center shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-[var(--text)] leading-snug">
              {MAINTENANCE_HEADING}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed max-w-3xl">
              {MAINTENANCE_BODY}
            </p>
            {variant === 'workspace' && (
              <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-300 font-medium pt-0.5">
                Saved plans, assessments, library items, resources, and exports remain available.
              </p>
            )}
          </div>
        </div>

        {onReturnHome && (
          <div className="shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Homepage</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
