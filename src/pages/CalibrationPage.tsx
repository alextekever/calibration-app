import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Backdrop,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Grid,
  Container,
  Switch,
  FormControlLabel,
  FormGroup,
  Slider,
  CircularProgress
} from '@mui/material';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Customized
} from 'recharts';
import TopBar from '../components/TopBar';

interface ThermistorData {
  id: number;
  name: string;
  voltage: number;
  temperature: number;
  color: string;
  active: boolean;
}

export interface ChartDataPoint {
  time: string; // for tooltip display
  timestamp: number; // numeric value for x-axis
  [key: string]: number | string;
}

export interface CalibrationLogEntry {
  calibrationNumber: number;
  time: string; // ISO string
  measuredTemperature: number;
  // Always sending a number (0 for disabled) so that backend float validation passes.
  measuredVoltageT1: number;
  measuredVoltageT2: number;
  measuredVoltageT3: number;
  measuredVoltageT4: number;
}

export interface CalibrationPoint {
  time: string;         // ISO string
  timestamp: number;    // numeric timestamp for x-axis
  temperature: number;  // temperature value at calibration time
  thermistorId: number;
  voltage: number;
  color: string;
}

// For type safety in our custom marker component.
interface CustomizedComponentProps {
  xAxisMap: { [key: string]: { scale: (val: number) => number; domain: number[] } };
  yAxisMap: { [key: string]: { scale: (val: number) => number; domain: number[] } };
  calibrationPoints: CalibrationPoint[];
}

const API_URL = import.meta.env.VITE_API_URL;


const CalibrationPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "Admin";

  const thermistorColors = ['#FF5733', '#33A8FF', '#33FF57', '#D433FF'];

  const [serialConnected, setSerialConnected] = useState(false);
  const [thermistors, setThermistors] = useState<ThermistorData[]>([
    { id: 1, name: 'Thermistor 1', voltage: 0, temperature: 0, color: thermistorColors[0], active: true },
    { id: 2, name: 'Thermistor 2', voltage: 0, temperature: 0, color: thermistorColors[1], active: true },
    { id: 3, name: 'Thermistor 3', voltage: 0, temperature: 0, color: thermistorColors[2], active: true },
    { id: 4, name: 'Thermistor 4', voltage: 0, temperature: 0, color: thermistorColors[3], active: true },
  ]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [calibrationLog, setCalibrationLog] = useState<CalibrationLogEntry[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [measuredTempInput, setMeasuredTempInput] = useState<number | ''>('');
  const [averagingTime, setAveragingTime] = useState<string>('0'); // in seconds
  const [averagingInProgress, setAveragingInProgress] = useState(false);
  const [timeRangeValue, setTimeRangeValue] = useState<number[]>([0, 100]);
  const [visibleData, setVisibleData] = useState<ChartDataPoint[]>([]);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const bufferRef = useRef<string>("");
  const averagingIntervalRef = useRef<any>(null);
  const averagingTimeoutRef = useRef<any>(null);
  const thermistorsRef = useRef(thermistors);



  useEffect(() => {
    if (chartData.length > 0 && calibrationPoints.length > 0) {
      console.log("Chart timestamp example:", chartData[0].timestamp, typeof chartData[0].timestamp);
      console.log("Calibration timestamp example:", calibrationPoints[0].timestamp, typeof calibrationPoints[0].timestamp);
    }
  }, [chartData, calibrationPoints]);

  
  useEffect(() => {
    thermistorsRef.current = thermistors;
  }, [thermistors]);

  useEffect(() => {
    if (id) {
      fetch(`${API_URL}/calibrations/${id}/log`)
        .then((res) => res.json())
        .then((data) => {
          setCalibrationLog(data);
        })
        .catch(console.error);
    }
  }, [id]);

  // Compute visibleData based solely on the slider values.
  useEffect(() => {
    if (chartData.length === 0) {
      setVisibleData([]);
      return;
    }
    if (timeRangeValue[1] === 100 && timeRangeValue[0] === 0) {
      setVisibleData(chartData);
    } else if (timeRangeValue[1] === 100) {
      const visibleCount = Math.max(1, Math.floor(chartData.length * (timeRangeValue[1] - timeRangeValue[0]) / 100));
      setVisibleData(chartData.slice(-visibleCount));
    } else {
      const startIdx = Math.floor(chartData.length * timeRangeValue[0] / 100);
      const endIdx = Math.floor(chartData.length * timeRangeValue[1] / 100);
      setVisibleData(chartData.slice(startIdx, endIdx + 1));
    }
  }, [chartData, timeRangeValue]);

  useEffect(() => {
    return () => {
      console.log("CalibrationPage unmounting – closing serial port");
      closeSerialPort();
      if (averagingIntervalRef.current) clearInterval(averagingIntervalRef.current);
      if (averagingTimeoutRef.current) clearTimeout(averagingTimeoutRef.current);
    };
  }, []);
  
  

  const closeSerialPort = async () => {
    try {
      if (readerRef.current) {
        try {
          await readerRef.current.cancel();
        } catch (e) {
          console.warn("Could not cancel reader:", e);
        }
        readerRef.current = null;
      }
      if (portRef.current && portRef.current.readable) {
        try {
          await portRef.current.close();
        } catch (e) {
          console.warn("Could not close port:", e);
        }
        portRef.current = null;
        setSerialConnected(false);
        console.log("Serial port closed");
      }
    } catch (error) {
      console.error("Error in serial port cleanup:", error);
    }
  };

  const updateSensorData = (line: string) => {
    const trimmed = line.trim();
    console.log("Received line:", trimmed);
    if (!trimmed || !trimmed.includes(",") || trimmed.startsWith("ets")) return;
    const parts = trimmed.split(",");
    if (parts.length !== 4) {
      console.warn("Invalid data line:", trimmed);
      return;
    }
    const voltages = parts.map((v) => parseFloat(v));

    // Only update active thermistors.
    setThermistors(prevThermistors =>
      prevThermistors.map((t, index) => {
        if (!t.active) return t;
        return {
          ...t,
          voltage: voltages[index],
          temperature: voltages[index] * 50,
        };
      })
    );

    const timestamp = Date.now();
    const currentTimeStr = new Date(timestamp).toLocaleTimeString();
    const newPoint: ChartDataPoint = { 
      time: currentTimeStr,
      timestamp: timestamp
    };

    thermistorsRef.current.forEach((t, index) => {
      if (t.active) {
        newPoint[t.name] = voltages[index] * 50;
      }
    });
    setChartData(prev => {
      const newData = [...prev, newPoint];
      if (newData.length > 500) {
        newData.shift(); // Remove the oldest data point
      }
      return newData;
    });
  };

  const openSerialPort = async (port: any) => {
    try {
      console.log("Opening port...");
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setSerialConnected(true);
      console.log("Port opened.");
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          console.log("Raw chunk received:", value);
          bufferRef.current += value;
          const lines = bufferRef.current.split("\n");
          bufferRef.current = lines.pop() || "";
          lines.forEach((line) => {
            console.log("Processing complete line:", line);
            updateSensorData(line);
          });
        }
      }
    } catch (error) {
      console.error("Error opening serial port:", error);
    }
  };

  const handleConnectPort = async () => {
    try {
      const serial = (navigator as any).serial;
      if (serial) {
        const port = await serial.requestPort();
        await openSerialPort(port);
      }
    } catch (error) {
      console.error("User did not select a port:", error);
    }
  };

  const handleReturnToDashboard = async () => {
    console.log("Return button pressed – closing serial port");
    await closeSerialPort();
    console.log("Serial port should now be closed");
    navigate('/dashboard');
    // As a safeguard, you might force a full page reload:
    window.location.reload();
  };
  const handleThermistorToggle = (id: number) => {
    setThermistors(thermistors.map(t => 
      t.id === id ? { ...t, active: !t.active } : t
    ));
  };

  const exportCalibrationLog = () => {
    if (calibrationLog.length === 0) {
      alert("No calibration data to export");
      return;
    }
    
    const headers = [
      "Calibration #", 
      "Time", 
      "Measured Temperature (°C)", 
      "Voltage T1 (V)", 
      "Voltage T2 (V)", 
      "Voltage T3 (V)", 
      "Voltage T4 (V)"
    ];
    
    const csvContent = [
      headers.join(','),
      ...calibrationLog.map(log => [
        log.calibrationNumber,
        log.time,
        log.measuredTemperature,
        log.measuredVoltageT1 ? log.measuredVoltageT1.toFixed(3) : '',
        log.measuredVoltageT2 ? log.measuredVoltageT2.toFixed(3) : '',
        log.measuredVoltageT3 ? log.measuredVoltageT3.toFixed(3) : '',
        log.measuredVoltageT4 ? log.measuredVoltageT4.toFixed(3) : ''
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calibration_log_${id}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Compute x-axis domain solely from visible data.
  // Combine timestamps from both live data and calibration points:
  const liveTimestamps = visibleData.map(d => d.timestamp);
  const calibrationTimestamps = calibrationPoints.map(cp => cp.timestamp);
  const allTimestamps = [...liveTimestamps, ...calibrationTimestamps];
  const domainMin = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
  const domainMax = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;



  // Custom marker render function: only render markers that fall within the current x-axis domain.
  // In renderCalibrationMarkers function
  const renderCalibrationMarkers = (props: CustomizedComponentProps) => {
    const xAxis = Object.values(props.xAxisMap)[0];
    const yAxis = Object.values(props.yAxisMap)[0];
    
    return (
      <g>
        {props.calibrationPoints.map((cp: CalibrationPoint, index: number) => {
          // Use the same scale function as the chart uses
          const xCoord = xAxis.scale(cp.timestamp);
          const yCoord = yAxis.scale(cp.temperature);
          const yBottom = yAxis.scale(yAxis.domain[0]);
          
          // Debug logging
          console.log("Calibration point:", cp, "Coords:", {x: xCoord, y: yCoord});
          
          return (
            <g key={`calib-${index}`}>
              <line 
                x1={xCoord} 
                y1={yCoord} 
                x2={xCoord} 
                y2={yBottom} 
                stroke={cp.color} 
                strokeDasharray="3 3" 
              />
              <circle 
                cx={xCoord} 
                cy={yCoord} 
                r={4} 
                fill={cp.color} 
              />
            </g>
          );
        })}
      </g>
    );
  };

  const handleCalibrate = () => {
    if (measuredTempInput === '' || isNaN(Number(measuredTempInput))) {
      console.warn("Invalid temperature input");
      return;
    }
    
    const activeThermistors = thermistors.filter(t => t.active);
    if (activeThermistors.length === 0) {
      alert("Please activate at least one thermistor before calibrating");
      return;
    }
    
    if (averagingIntervalRef.current) {
      clearInterval(averagingIntervalRef.current);
      averagingIntervalRef.current = null;
    }
    if (averagingTimeoutRef.current) {
      clearTimeout(averagingTimeoutRef.current);
      averagingTimeoutRef.current = null;
    }
    
    const avgTime = Number(averagingTime);
    const timestamp = Date.now();
    const isoTime = new Date(timestamp).toISOString().replace('Z', '+00:00');

    if (avgTime > 0) {
      setAveragingInProgress(true);
      let sumT1 = 0, sumT2 = 0, sumT3 = 0, sumT4 = 0, count = 0;
      const intervalMs = 500;
      averagingIntervalRef.current = setInterval(() => {
        sumT1 += thermistorsRef.current[0].active ? thermistorsRef.current[0].voltage : 0;
        sumT2 += thermistorsRef.current[1].active ? thermistorsRef.current[1].voltage : 0;
        sumT3 += thermistorsRef.current[2].active ? thermistorsRef.current[2].voltage : 0;
        sumT4 += thermistorsRef.current[3].active ? thermistorsRef.current[3].voltage : 0;
        count++;
      }, intervalMs);
      averagingTimeoutRef.current = setTimeout(() => {
        clearInterval(averagingIntervalRef.current);
        averagingIntervalRef.current = null;
        const avgT1 = count > 0 ? sumT1 / count : 0;
        const avgT2 = count > 0 ? sumT2 / count : 0;
        const avgT3 = count > 0 ? sumT3 / count : 0;
        const avgT4 = count > 0 ? sumT4 / count : 0;
        const calibrationNumber = calibrationLog.length + 1;
        
        // For disabled thermistors, send 0 so that the backend gets a float.
        const newEntry: CalibrationLogEntry = {
          calibrationNumber,
          time: isoTime,
          measuredTemperature: Number(measuredTempInput),
          measuredVoltageT1: thermistorsRef.current[0].active ? avgT1 : 0,
          measuredVoltageT2: thermistorsRef.current[1].active ? avgT2 : 0,
          measuredVoltageT3: thermistorsRef.current[2].active ? avgT3 : 0,
          measuredVoltageT4: thermistorsRef.current[3].active ? avgT4 : 0,
        };
        
        const newCalibrationPoints: CalibrationPoint[] = thermistorsRef.current
          .filter(t => t.active)
          .map(t => ({
            time: isoTime,
            timestamp,
            temperature: t.temperature,
            thermistorId: t.id,
            voltage: t.voltage,
            color: t.color,
          }));
        
          setCalibrationPoints(prev => {
            const newCalibrations = [...prev, ...newCalibrationPoints];
            if (newCalibrations.length > 500) {
              newCalibrations.shift(); // Remove oldest calibration marker
            }
            return newCalibrations;
          });
          
        saveCalibrationEntry(newEntry);
        setAveragingInProgress(false);
        setMeasuredTempInput('');
      }, avgTime * 1000);
    } else {
      const calibrationNumber = calibrationLog.length + 1;
      const newEntry: CalibrationLogEntry = {
        calibrationNumber,
        time: isoTime,
        measuredTemperature: Number(measuredTempInput),
        measuredVoltageT1: thermistors[0].active ? thermistors[0].voltage : 0,
        measuredVoltageT2: thermistors[1].active ? thermistors[1].voltage : 0,
        measuredVoltageT3: thermistors[2].active ? thermistors[2].voltage : 0,
        measuredVoltageT4: thermistors[3].active ? thermistors[3].voltage : 0,
      };
      
      const newCalibrationPoints: CalibrationPoint[] = thermistorsRef.current
        .filter(t => t.active)
        .map(t => ({
          time: isoTime,
          timestamp: timestamp, // Ensure this matches the format in chart data
          temperature: Number(measuredTempInput), // Use the measured temperature, not calculated
          thermistorId: t.id,
          voltage: t.voltage,
          color: t.color,
        }));
          
      setCalibrationPoints(prev => [...prev, ...newCalibrationPoints]);
      saveCalibrationEntry(newEntry);
    }
  };

  const saveCalibrationEntry = (entry: CalibrationLogEntry) => {
    const formData = {
      calibration_number: entry.calibrationNumber,
      measured_temperature: Number(entry.measuredTemperature),
      voltage_t1: entry.measuredVoltageT1,
      voltage_t2: entry.measuredVoltageT2,
      voltage_t3: entry.measuredVoltageT3,
      voltage_t4: entry.measuredVoltageT4,
      time: entry.time
    };
    
    console.log("Calibration log payload:", formData);
    fetch(`${API_URL}/calibrations/${id}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then(text => {
            console.error(`Server response (${res.status}):`, text);
            throw new Error(`Server responded with ${res.status}: ${res.statusText}`);
          });
        }
        return res.json();
      })
      .then(() => {
        setCalibrationLog(prev => [...prev, entry]);
      })
      .catch(error => {
        console.error("Error saving calibration data:", error);
        setAveragingInProgress(false);
      });
  };

  const handleTimeRangeChange = (_event: Event, newValue: number | number[]) => {
    setTimeRangeValue(newValue as number[]);
  };

  return (
    <Box>
      <TopBar
        showReturn
        calibrationName={`Calibration ${id}`}
        username={username}
        onReturn={handleReturnToDashboard}
        onSave={exportCalibrationLog}
        onLogout={() => {
          closeSerialPort().then(() => {
            localStorage.removeItem("isAuthenticated");
            localStorage.removeItem("username");
            navigate('/');
          });
        }}
      />
      <Container maxWidth="lg" sx={{ mt: 12 }}>
        {!serialConnected && (
          <Backdrop
            sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
            open={!serialConnected}
          >
            <Box textAlign="center">
              <Typography variant="h5" gutterBottom>
                Please disconnect any connected ESP32, then connect the USB cable.
              </Typography>
              <Typography variant="body1">
                Waiting for device connection...
              </Typography>
              <Button variant="contained" sx={{ mt: 2, mr: 2 }} onClick={handleConnectPort}>
                Connect Port
              </Button>
              <Button variant="contained" onClick={handleReturnToDashboard}>
                Back
              </Button>
            </Box>
          </Backdrop>
        )}

        {serialConnected && (
          <>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" align="center" gutterBottom>
                    Thermistor Controls
                  </Typography>
                  <FormGroup row sx={{ display: 'flex', justifyContent: 'space-around', mb: 2 }}>
                    {thermistors.map((t) => (
                      <FormControlLabel
                        key={t.id}
                        control={
                          <Switch
                            checked={t.active}
                            onChange={() => handleThermistorToggle(t.id)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: t.color,
                                '& + .MuiSwitch-track': {
                                  backgroundColor: t.color,
                                  opacity: 0.5,
                                },
                              },
                            }}
                          />
                        }
                        label={t.name}
                      />
                    ))}
                  </FormGroup>
                </Paper>
                
                <Typography variant="h6" align="center" gutterBottom>
                  Thermistor Readings
                </Typography>
                <TableContainer component={Paper} sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Thermistor</TableCell>
                        <TableCell>Voltage (V)</TableCell>
                        <TableCell>Temperature (°C)</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {thermistors.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{t.name}</TableCell>
                          <TableCell>{t.active ? t.voltage.toFixed(3) : '-'}</TableCell>
                          <TableCell>{t.active ? t.temperature.toFixed(2) : '-'}</TableCell>
                          <TableCell>
                            {t.active ? (
                              <Typography sx={{ color: 'green' }}>Active</Typography>
                            ) : (
                              <Typography sx={{ color: 'gray' }}>Disabled</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mb: 2 }}>
                  <TextField
                    label="Measured Temperature (°C)"
                    type="number"
                    value={measuredTempInput}
                    onChange={(e) => setMeasuredTempInput(Number(e.target.value))}
                    fullWidth
                  />
                  <TextField
                    label="Averaging Time (s)"
                    type="number"
                    value={averagingTime}
                    onChange={(e) => setAveragingTime(e.target.value)}
                    helperText="Enter 0 for no averaging"
                    fullWidth
                  />
                  <Button 
                    variant="contained" 
                    onClick={handleCalibrate} 
                    disabled={averagingInProgress || !thermistors.some(t => t.active)}
                    startIcon={averagingInProgress ? <CircularProgress size={20} color="inherit" /> : null}
                    fullWidth
                  >
                    {averagingInProgress ? "Averaging..." : "Calibrate at Temperature"}
                  </Button>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="h6" align="center" gutterBottom>
                  Live Temperature Graph
                </Typography>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ mb: 2 }}>
                    <Typography gutterBottom>Time Range</Typography>
                    <Slider
                      value={timeRangeValue}
                      onChange={handleTimeRangeChange}
                      valueLabelDisplay="auto"
                      aria-labelledby="time-range-slider"
                    />
                  </Box>
                  
                  <Box sx={{ height: 400, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={visibleData}
                        margin={{ top: 5, right: 20, bottom: 20, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="timestamp"
                          domain={[domainMin, domainMax]}
                          tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                          tick={{ fontSize: 10 }}
                          interval="preserveStartEnd"
                        />

                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip labelFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                        <Legend />
                        
                        {thermistors
                          .filter(t => t.active)
                          .map((t) => (
                            <Line
                              key={t.id}
                              type="monotone"
                              dataKey={t.name}
                              stroke={t.color}
                              isAnimationActive={false}
                              dot={false}
                            />
                          ))}
                        
                        <Customized component={(props: any) =>
                          renderCalibrationMarkers({ ...(props as CustomizedComponentProps), calibrationPoints })
                        } />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" align="center" gutterBottom>
                Calibration Log
              </Typography>
              {calibrationLog && calibrationLog.length > 0 ? (
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Calibration #</TableCell>
                        <TableCell>Time</TableCell>
                        <TableCell>Temperature (°C)</TableCell>
                        <TableCell>V T1</TableCell>
                        <TableCell>V T2</TableCell>
                        <TableCell>V T3</TableCell>
                        <TableCell>V T4</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {calibrationLog.map((log) => (
                        <TableRow key={log.calibrationNumber}>
                          <TableCell>{log.calibrationNumber}</TableCell>
                          <TableCell>{new Date(log.time).toLocaleTimeString()}</TableCell>
                          <TableCell>{log.measuredTemperature}</TableCell>
                          <TableCell>{log.measuredVoltageT1 ? log.measuredVoltageT1.toFixed(3) : '-'}</TableCell>
                          <TableCell>{log.measuredVoltageT2 ? log.measuredVoltageT2.toFixed(3) : '-'}</TableCell>
                          <TableCell>{log.measuredVoltageT3 ? log.measuredVoltageT3.toFixed(3) : '-'}</TableCell>
                          <TableCell>{log.measuredVoltageT4 ? log.measuredVoltageT4.toFixed(3) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body1" align="center">
                  No calibration data available yet.
                </Typography>
              )}
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
};

export default CalibrationPage;
