import type { ReactNode } from 'react';
import './stt.css';

// Wraps a page in the scoped, RTL stt styles.
export default function SttTool({ children }: { children: ReactNode }) {
  return (
    <div className="stt-tool" dir="rtl" lang="he">
      <main className="container">{children}</main>
    </div>
  );
}
