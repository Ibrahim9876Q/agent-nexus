import { useState, type MouseEvent, type ReactNode } from 'react';

export function ExternalLink({
  href,
  children,
  className,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const [error, setError] = useState('');
  if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
  async function open(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !window.nexusDesktop ||
      (event.type === 'auxclick' && event.button !== 1)
    )
      return;
    event.preventDefault();
    setError('');
    try {
      await window.nexusDesktop.openLink(event.currentTarget.href);
    } catch {
      setError(
        'Could not open the link. Copy its address and open it in your browser.',
      );
    }
  }
  return (
    <>
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={open}
        onAuxClick={open}
      >
        {children}
      </a>
      {error && (
        <span className="link-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
