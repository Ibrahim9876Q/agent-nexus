import type { Account } from '../src/types';
import { admissionReason } from '../src/account-capacity';
// Read-only telemetry. Unknown data is never shown as unused quota.
export function AccountCapacity({
  account,
  compact = false,
}: {
  account: Account;
  compact?: boolean;
}) {
  const windows = [account.capacity?.primary, account.capacity?.secondary];
  const reason = admissionReason(account);
  return (
    <div className={'capacity ' + (compact ? 'compact' : '')}>
      <div className="capacity-state">
        <span className={reason ? 'waiting' : 'available'}>
          {reason || 'accepting work'}
        </span>
        {!compact && (
          <small>
            {account.capacity
              ? `observed ${new Date(account.capacity.observedAt).toLocaleTimeString()}`
              : 'limits not reported'}
          </small>
        )}
      </div>
      {windows.some(Boolean) ? (
        windows.map(
          (w, i) =>
            w && (
              <div
                className="capacity-window"
                key={i}
                title={
                  w.resetsAt
                    ? `Reset: ${new Date(w.resetsAt * 1000).toLocaleString()}`
                    : 'Reset time unavailable'
                }
              >
                <span>
                  {w.windowDurationMins
                    ? `${w.windowDurationMins >= 60 ? Math.round(w.windowDurationMins / 60) + 'h' : w.windowDurationMins + 'm'} window`
                    : i === 0
                      ? 'primary'
                      : 'secondary'}
                </span>
                <meter
                  min="0"
                  max="100"
                  value={Math.min(100, w.usedPercent)}
                  aria-label={`${i === 0 ? 'Primary' : 'Secondary'} quota used`}
                />
                <b>{Math.round(w.usedPercent)}%</b>
                {!compact && w.resetsAt && (
                  <small>
                    resets{' '}
                    {new Date(w.resetsAt * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                )}
              </div>
            ),
        )
      ) : (
        <span className="capacity-unknown">— capacity unknown</span>
      )}
    </div>
  );
}
