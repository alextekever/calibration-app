// src/components/TopBar.tsx
import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, IconButton, Typography, Button, Box } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface TopBarProps {
  showReturn?: boolean;
  calibrationName?: string;
  username: string;
  onReturn?: () => void;
  onSave: () => void;
  onLogout: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ showReturn = false, calibrationName, username, onReturn, onSave, onLogout }) => {
  const [dateTime, setDateTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <AppBar position="fixed" sx={{ top: 0, left: 0, width: '100%' }}>
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {showReturn && (
            <IconButton edge="start" color="inherit" onClick={onReturn}>
              <ArrowBackIcon />
            </IconButton>
          )}
          {calibrationName && (
            <Typography variant="h6" sx={{ ml: showReturn ? 1 : 0 }}>
              {calibrationName}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body1">{dateTime.toLocaleString()}</Typography>
          <Typography variant="body1">{username}</Typography>
          <Button color="inherit" onClick={onSave}>Export</Button>
          <Button color="inherit" onClick={onLogout}>Logout</Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
