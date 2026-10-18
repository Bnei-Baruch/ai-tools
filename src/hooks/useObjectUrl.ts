import { useEffect, useMemo } from 'react';

// Object URL for a blob or text, revoked when the content changes or on unmount.
export default function useObjectUrl(content: Blob | string | null | undefined, type = ''): string | null {
  const url = useMemo(() => {
    if (content == null) return null;
    return URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  }, [content, type]);

  useEffect(() => {
    if (url) return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
