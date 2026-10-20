import React, { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import SttApiStatus from './SttApiStatus';
import { cx } from './ui';

const ITEM = 'border-b-2 px-4 py-3 text-sm whitespace-nowrap';

// tools: [{path, title, element, disabled, sttApi, keepAlive}] -- one menu item each.
// keepAlive tools are rendered here rather than by their route, so they survive navigation.
const Layout = ({ tools }) => {
  const { pathname } = useLocation();
  const active = tools.find((t) => !t.disabled && (pathname === `/${t.path}` || pathname.startsWith(`/${t.path}/`)));
  const [opened, setOpened] = useState(() => new Set());

  useEffect(() => {
    if (active?.keepAlive && !opened.has(active.path)) setOpened(new Set(opened).add(active.path));
  }, [active, opened]);

  const kept = tools.filter((t) => t.keepAlive && !t.disabled && (t === active || opened.has(t.path)));

  return (
    <>
      <nav className='flex overflow-x-auto border-b border-slate-200 bg-white'>
        {tools.map(({ path, title, disabled }) => (disabled
          ? <span key={path} className={cx(ITEM, 'cursor-not-allowed border-transparent text-slate-400')} title='Temporarily unavailable'>{title}</span>
          : (
            <NavLink
              key={path}
              to={`/${path}`}
              className={({ isActive }) => cx(ITEM, isActive
                ? 'border-blue-600 font-semibold text-slate-900'
                : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900')}
            >
              {title}
            </NavLink>
          )
        ))}
        {tools.some((t) => t.sttApi && !t.disabled) && (
          <div className='ml-auto'>
            <SttApiStatus />
          </div>
        )}
      </nav>
      <Suspense fallback={null}>
        {kept.map((t) => <div key={t.path} hidden={t !== active}>{t.element}</div>)}
        <Outlet />
      </Suspense>
    </>
  );
};

export default Layout;
