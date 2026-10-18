import React, { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Menu } from 'semantic-ui-react';
import SttApiStatus from './SttApiStatus';

// tools: [{path, title}] -- one menu item each
const Layout = ({ tools }) => (
  <>
    <Menu attached='top'>
      {tools.map(({ path, title }) => (
        <Menu.Item key={path} as={NavLink} to={`/${path}`} content={title} />
      ))}
      <Menu.Menu position='right'>
        <SttApiStatus />
      </Menu.Menu>
    </Menu>
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  </>
);

export default Layout;
