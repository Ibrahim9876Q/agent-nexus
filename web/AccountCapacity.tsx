import type { Account } from '../src/types';
import { admissionReason } from '../src/account-capacity';

export function AccountCapacity({
  account,
  compact = false,
}: {
  account: Account;
  compact?: boolean;
}) {
  const windows = [account.capacity?.primary, account.capacity?.secondary];
  const reason = admissionReason(account);
  const observed = account.capacity
    ? new Date(account.capacity.observedAt).toLocaleTimeString()
    : 'unavailable';
  return (
    <div className={'capacity ' + (compact ? 'compact' : '')}>
      {(!compact || reason) && (
        <div className="capacity-state">
          <span className={reason ? 'waiting' : 'available'}>
            {reason || 'accepting work'}
          </span>
          {!compact && <small>observed {observed}</small>}
        </div>
      )}
      <div className="capacity-percentages">
        {windows.map((window, i) => {
          const label = window?.windowDurationMins
            ? window.windowDurationMins >= 60
              ? Math.round(window.windowDurationMins / 60) + 'h'
              : window.windowDurationMins + 'm'
            : i === 0
              ? 'Primary'
              : 'Secondary';
          return (
            <div
              key={i}
              className="capacity-percentage"
              title={
                window
                  ? label +
                    ' quota used · observed ' +
                    observed +
                    (window.resetsAt
                      ? ' · resets ' +
                        new Date(window.resetsAt * 1000).toLocaleString()
                      : '')
                  : 'Usage not reported'
              }
            >
              <span>{label}</span>
              <b aria-label={label + ' quota used'}>
                {window ? Math.round(window.usedPercent) + '%' : '—'}
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
