import { useEffect, useState } from 'react';
import type { Attachment } from '../src/types';
import { imageBlob } from './api';

export function ImageAttachment({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let dead = false,
      objectUrl = '';
    imageBlob(attachment.id)
      .then((blob) => {
        if (!dead) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);
  return (
    <figure className="image-attachment">
      <button
        type="button"
        className="image-thumbnail"
        aria-label={'View ' + attachment.name}
        onClick={() => setExpanded(true)}
        disabled={!url}
      >
        {url ? (
          <img src={url} alt={attachment.name} />
        ) : (
          <span>{failed ? 'Image unavailable' : 'Loading image…'}</span>
        )}
      </button>
      <figcaption title={attachment.name}>{attachment.name}</figcaption>
      {onRemove && (
        <button
          type="button"
          className="remove-image"
          aria-label={'Remove ' + attachment.name}
          onClick={onRemove}
        >
          ×
        </button>
      )}
      {expanded && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={attachment.name}
          onClick={() => setExpanded(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setExpanded(false);
            }
          }}
          tabIndex={-1}
        >
          <button
            autoFocus
            aria-label="Close image"
            onClick={() => setExpanded(false)}
          >
            ×
          </button>
          <img
            src={url}
            alt={attachment.name}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </figure>
  );
}
