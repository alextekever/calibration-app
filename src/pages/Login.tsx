import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;
console.log("API_URL:", API_URL);

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      if (!response.ok) {
        alert('Invalid credentials');
        return;
      }
      const data = await response.json();
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("permission", data.permission.toString());
        localStorage.setItem("user_id", data.id.toString());  // Ensure this is present
        navigate('/dashboard');
        console.log("Logged in user_id:", localStorage.getItem("user_id"));


    } catch (error) {
      console.error(error);
    }
  };
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      justifyContent: 'space-between'
    }}>
      <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Paper sx={{ p: 4, width: 300 }}>
          <Typography variant="h5" align="center" gutterBottom>
            Login
          </Typography>
          <form onSubmit={handleLogin}>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              margin="normal"
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>
              Login
            </Button>
          </form>
        </Paper>
      </Box>

      <Box sx={{ textAlign: 'center', p: 2, backgroundColor: '#f0f0f0' }}>
        <Typography variant="body2" sx={{ color: 'grey', fontSize: '0.875rem' }}>
          Accessing calibration-app-three.vercel.app
        </Typography>
        <Typography variant="body2" sx={{ color: 'grey', fontSize: '0.875rem' }}>
          Calibration App Web
        </Typography>
        <Typography variant="body2" sx={{ color: 'grey', fontSize: '0.875rem' }}>
          Version 2025.02.24
        </Typography>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'grey', fontSize: '0.875rem' }}>
            Built by Tekever Space Mechanical Team
          </Typography>
        </Box>
        <img src="/logo.png" alt="Logo" style={{ height: 15, marginBottom: 2 }} />
      </Box>
    </Box>
  );
};

export default Login;
