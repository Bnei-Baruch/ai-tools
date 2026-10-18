import React, { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Menu } from 'semantic-ui-react';
import SttApiStatus from './SttApiStatus';

// tools: [{path, title, disabled, sttApi}] -- one menu item each
const Layout = ({ tools }) => (
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
      <Outlet />
    </Suspense>
  </>
);

export default Layout;
