import React, { useEffect, useState } from 'react';
import { Icon, Menu } from 'semantic-ui-react';
import { sttHealth } from '../api/stt';

const HEALTH_INTERVAL_MS = 60000;

// Menu item with a green/red dot from stt-api's /health.
const SttApiStatus = () => {
  const [alive, setAlive] = useState(null);

  useEffect(() => {
    const check = () => sttHealth().then(() => setAlive(true), () => setAlive(false));
    check();
    const id = setInterval(check, HEALTH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const color = alive === null ? 'grey' : alive ? 'green' : 'red';
  return (
    <Menu.Item title={alive === false ? 'STT API is unreachable' : undefined}>
      <Icon name='circle' color={color} />STT API
    </Menu.Item>
  );
};

export default SttApiStatus;
