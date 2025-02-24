// src/pages/CalibrationIndex.tsx
import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Container } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';

interface Calibration {
  id: string;
  name: string;
  createdAt: string;
  user: string;
}

const API_URL = process.env.REACT_APP_API_URL;


const CalibrationIndex: React.FC = () => {
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "Admin";
  const user_id = localStorage.getItem("user_id") || "1";
  const [newCalibrationName, setNewCalibrationName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);

  // Fetch calibration projects from the backend when the component mounts.
  useEffect(() => {
    fetch(`${API_URL}/calibrations/?user_id=${user_id}`)
      .then((res) => res.json())
      .then((data) => {
        // Assume the backend returns a list of CalibrationProject objects.
        const projects: Calibration[] = data.map((p: any) => ({
          id: p.id, // now a uuid string
          name: p.name,
          createdAt: new Date(p.created_at).toLocaleString(),
          user: username, // you may also include the actual user name from p if available
        }));
        setCalibrations(projects);
      })
      .catch(console.error);
  }, [user_id, username]);

  const handleCreateClick = () => setShowInput(true);

  const handleCreateNew = () => {
    if (!newCalibrationName.trim()) return;
    // Prepare data for POST request.
    const postData = {
      name: newCalibrationName,
      user_id: Number(user_id),
    };
    fetch("${API_URL}/calibrations/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Server error ${res.status}`);
        }
        return res.json();
      })
      .then((project) => {
        // The project.id is now a UUID.
        const newCal: Calibration = {
          id: project.id,
          name: project.name,
          createdAt: new Date(project.created_at).toLocaleString(),
          user: username,
        };
        // Add the new calibration to the list.
        setCalibrations([...calibrations, newCal]);
        setNewCalibrationName('');
        setShowInput(false);
      })
      .catch(console.error);
  };

// Inside CalibrationIndex.tsx's handleDelete function:
const handleDelete = (id: string) => {
  if (window.confirm("Are you sure you want to delete this calibration?")) {
    fetch(`${API_URL}/calibrations/${id}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }
        return res.json();
      })
      .then(() => {
        setCalibrations(calibrations.filter(cal => cal.id !== id));
      })
      .catch(console.error);
  }
};


  return (
    <Box>
      <TopBar 
        username={username}
        onSave={() => console.log('Save clicked')}
        onLogout={() => {
          localStorage.removeItem("isAuthenticated");
          localStorage.removeItem("username");
          localStorage.removeItem("user_id");
          navigate('/');
        }}
      />
      <Container maxWidth="md" sx={{ mt: 12 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {!showInput ? (
            <Button variant="contained" onClick={handleCreateClick}>
              Create New Calibration
            </Button>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 2, width: '100%' }}>
              <TextField 
                label="Calibration Name" 
                value={newCalibrationName} 
                onChange={(e) => setNewCalibrationName(e.target.value)}
                sx={{ width: '50%' }}
              />
              <Button variant="contained" onClick={handleCreateNew}>
                Confirm
              </Button>
            </Box>
          )}
          <Typography variant="h6" gutterBottom>
            Previously Created Calibrations:
          </Typography>
          <TableContainer component={Paper} sx={{ width: '100%' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {calibrations.map((cal) => (
                  <TableRow key={cal.id}>
                    <TableCell>{cal.name}</TableCell>
                    <TableCell>{cal.createdAt}</TableCell>
                    <TableCell>{cal.user}</TableCell>
                    <TableCell>
                      <Button variant="outlined" onClick={() => navigate(`/calibration/${cal.id}`)}>
                        Open
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => handleDelete(cal.id)} sx={{ ml: 1 }}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Container>
    </Box>
  );
};

export default CalibrationIndex;
