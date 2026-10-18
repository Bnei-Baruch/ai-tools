import React, { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'semantic-ui-react';
import SttApiStatus from './SttApiStatus';

// tools: [{path, title, element, disabled, sttApi, keepAlive}] -- one menu item each.
// keepAlive tools are rendered here rather than by their route, so they survive navigation.
const Layout = ({ tools }) => {
  const { pathname } = useLocation();
  const active = tools.find((t) => !t.disabled && pathname === `/${t.path}`);
  const [opened, setOpened] = useState(() => new Set());

  useEffect(() => {
    if (active?.keepAlive && !opened.has(active.path)) setOpened(new Set(opened).add(active.path));
  }, [active, opened]);

  const kept = tools.filter((t) => t.keepAlive && !t.disabled && (t === active || opened.has(t.path)));

  return (
    <>
      <Menu attached='top'>
        {tools.map(({ path, title, disabled }) => (disabled
          ? <Menu.Item key={path} disabled content={title} title='Temporarily unavailable' />
          : <Menu.Item key={path} as={NavLink} to={`/${path}`} content={title} />
        ))}
        {tools.some((t) => t.sttApi && !t.disabled) && (
          <Menu.Menu position='right'>
            <SttApiStatus />
          </Menu.Menu>
        )}
      </Menu>
      <Suspense fallback={null}>
        {kept.map((t) => <div key={t.path} hidden={t !== active}>{t.element}</div>)}
        <Outlet />
      </Suspense>
    </>
  );
};

export default Layout;
