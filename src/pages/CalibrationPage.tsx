// CalibrationPage.tsx
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
  id: number;           // 1–4 (UI thermistors mapping to channels 29–32)
  name: string;
  resistance: number;   // measured resistance in ohms (from ESP32)
  temperature: number;  // calculated temperature in °C
  color: string;
  active: boolean;
}

export interface ChartDataPoint {
  time: string;         // for tooltip display
  timestamp: number;    // numeric value for x-axis
  [key: string]: number | string;
}

export interface CalibrationLogEntry {
  calibrationNumber: number;
  time: string;         // ISO string
  measuredTemperature: number;
  measuredResistanceT1: number;
  measuredResistanceT2: number;
  measuredResistanceT3: number;
  measuredResistanceT4: number;
}

export interface CalibrationPoint {
  time: string;         // ISO string
  timestamp: number;    // numeric timestamp for x-axis
  temperature: number;  // temperature value at calibration time
  thermistorId: number;
  resistance: number;
  color: string;
}

interface CalibrationCoeffs {
  A: number;
  B: number;
  C: number;
  D: number;
}

// For type safety with our custom marker component.
interface CustomizedComponentProps {
  xAxisMap: { [key: string]: { scale: (val: number) => number; domain: number[] } };
  yAxisMap: { [key: string]: { scale: (val: number) => number; domain: number[] } };
  calibrationPoints: CalibrationPoint[];
}

const API_URL = import.meta.env.VITE_API_URL;

/* ---------- Helper Functions ---------- */

// Solve a 4x4 linear system using Gaussian elimination.
function solveLinearSystem(X: number[][], Y: number[]): number[] {
  const n = 4;
  const A = X.map(row => row.slice());
  const b = Y.slice();
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) {
      throw new Error("Matrix is singular or nearly singular");
    }
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      b[k] -= factor * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    x[i] = (b[i] - sum) / A[i][i];
  }
  return x;
}

// Compute coefficients for a given channel using calibration log data.
// For channel 29 use measuredResistanceT1, 30 → measuredResistanceT2, etc.
function computeCoeffs(channel: number, calibrationLog: CalibrationLogEntry[]): CalibrationCoeffs {
  // Extract calibration points for this channel.
  const points: { resistance: number, temperature: number }[] = [];
  calibrationLog.forEach(log => {
    let r = 0;
    if (channel === 29) r = log.measuredResistanceT1;
    else if (channel === 30) r = log.measuredResistanceT2;
    else if (channel === 31) r = log.measuredResistanceT3;
    else if (channel === 32) r = log.measuredResistanceT4;
    if (r > 0) {
      // Convert measured temperature (°C) to Kelvin.
      points.push({ resistance: r, temperature: log.measuredTemperature + 273.15 });
    }
  });
  // If fewer than 4 points, use default standard values.
  if (points.length < 4) {
    const standard_resistances = [3017.3, 1265.1, 974.3, 533.8];
    const standard_temperatures = [60 + 273.15, 90 + 273.15, 100 + 273.15, 125 + 273.15];
    for (let i = 0; i < 4; i++) {
      points[i] = { resistance: standard_resistances[i], temperature: standard_temperatures[i] };
    }
  } else {
    // Use only the last 4 calibration points.
    points.splice(0, points.length - 4);
  }
  const X = points.map(p => {
    const lnR = Math.log(p.resistance);
    return [1, lnR, lnR * lnR, lnR * lnR * lnR];
  });
  const Y = points.map(p => 1 / p.temperature);
  const coeffs = solveLinearSystem(X, Y);
  return { A: coeffs[0], B: coeffs[1], C: coeffs[2], D: coeffs[3] };
}

/* ---------- Component Begins ---------- */

const CalibrationPage: React.FC = () => {
  const { id } = useParams(); // calibration project ID from URL
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "Admin";

  // For PT100 calibration only: UI thermistors 1–4 map to channels 29,30,31,32.
  const thermistorColors = ['#FF5733', '#33A8FF', '#33FF57', '#D433FF'];
  const [thermistors, setThermistors] = useState<ThermistorData[]>([
    { id: 1, name: 'Thermistor 1', resistance: 0, temperature: 0, color: thermistorColors[0], active: true },
    { id: 2, name: 'Thermistor 2', resistance: 0, temperature: 0, color: thermistorColors[1], active: true },
    { id: 3, name: 'Thermistor 3', resistance: 0, temperature: 0, color: thermistorColors[2], active: true },
    { id: 4, name: 'Thermistor 4', resistance: 0, temperature: 0, color: thermistorColors[3], active: true },
  ]);

  // Remove separate calibrationCoeffs state.
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [calibrationLog, setCalibrationLog] = useState<CalibrationLogEntry[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [measuredTempInput, setMeasuredTempInput] = useState<number | ''>('');
  const [averagingTime, setAveragingTime] = useState<string>('0'); // in seconds
  const [averagingInProgress, setAveragingInProgress] = useState(false);
  const [timeRangeValue, setTimeRangeValue] = useState<number[]>([0, 100]);
  const [visibleData, setVisibleData] = useState<ChartDataPoint[]>([]);
  const [serialConnected, setSerialConnected] = useState(false);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const bufferRef = useRef<string>("");
  const averagingIntervalRef = useRef<any>(null);
  const averagingTimeoutRef = useRef<any>(null);
  const thermistorsRef = useRef(thermistors);

  useEffect(() => {
    thermistorsRef.current = thermistors;
  }, [thermistors]);

  useEffect(() => {
    if (id) {
      fetch(`${API_URL}/calibrations/${id}/log`)
        .then((res) => res.json())
        .then((data) => setCalibrationLog(data))
        .catch(console.error);
    }
  }, [id]);

  // Compute visible chart data based on slider values.
  useEffect(() => {
    if (chartData.length === 0) {
      setVisibleData([]);
      return;
    }
    if (timeRangeValue[0] === 0 && timeRangeValue[1] === 100) {
      setVisibleData(chartData);
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

  // Close the serial port.
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
      console.error("Error during serial port cleanup:", error);
    }
  };

  // Process incoming data from the ESP32.
  // The ESP32 sends a semicolon-separated list of tokens like "29:resistance;31:resistance", etc.
  const updateSensorData = (line: string) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("ets")) return;

    // Build a mapping: channel number -> resistance value.
    const tokens = trimmed.split(";");
    const dataMap: { [channel: number]: number } = {};
    tokens.forEach(token => {
      const parts = token.split(":");
      if (parts.length === 2) {
        const channel = parseInt(parts[0]);
        const value = parseFloat(parts[1]);
        if (!isNaN(channel) && !isNaN(value)) {
          dataMap[channel] = value;
        }
      }
    });

    const timestamp = Date.now();
    const currentTimeStr = new Date(timestamp).toLocaleTimeString();
    const newPoint: ChartDataPoint = { time: currentTimeStr, timestamp };

    // Update thermistors.
    setThermistors(prev =>
      prev.map(t => {
        if (!t.active) return t;
        const channel = t.id + 28; // UI thermistor id 1 -> channel 29, etc.
        if (dataMap.hasOwnProperty(channel)) {
          const resistance = dataMap[channel];
          // Compute coefficients on the fly using current calibration log.
          const coeff = computeCoeffs(channel, calibrationLog);
          let tempC = 0;
          if (resistance > 0 && coeff) {
            const lnR = Math.log(resistance);
            const tempK = 1 / (coeff.A + coeff.B * lnR + coeff.C * Math.pow(lnR, 2) + coeff.D * Math.pow(lnR, 3));
            tempC = tempK - 273.15;
          }
          newPoint[t.name] = tempC;
          return { ...t, resistance, temperature: tempC };
        } else {
          newPoint[t.name] = NaN;
          return { ...t, resistance: NaN, temperature: NaN };
        }
      })
    );

    setChartData(prev => {
      const newData = [...prev, newPoint];
      if (newData.length > 500) newData.shift();
      return newData;
    });
  };

  // Open the serial port and immediately send the start command.
  const openSerialPort = async (port: any) => {
    try {
      console.log("Opening port...");
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setSerialConnected(true);
      console.log("Port opened.");
      // Immediately send start command for PT100 channels:
      // "29,30,31,32;10,10,1,0" (read_time=10, switch_delay=10, temperature_mode=1, pt100_flag=0)
      await sendCommand("29,30,31,32;10,10,1,0");
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          
          bufferRef.current += value;
          const lines = bufferRef.current.split("\n");
          bufferRef.current = lines.pop() || "";
          lines.forEach(line => {
            
            updateSensorData(line);
          });
        }
      }
    } catch (error) {
      console.error("Error opening serial port:", error);
    }
  };

  // Send a command string to the ESP32.
  const sendCommand = async (command: string) => {
    if (portRef.current && portRef.current.writable) {
      const writer = portRef.current.writable.getWriter();
      await writer.write(new TextEncoder().encode(command + "\n"));
      writer.releaseLock();
      console.log("Sent command:", command);
    } else {
      console.error("Serial port not writable");
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
    window.location.reload();
  };

  // When a thermistor is toggled, update its active state and immediately send a new command.
  // The command sends a comma-separated list of active channels (each = UI id + 28), followed by ";1;1".
  const handleThermistorToggle = (id: number) => {
    setThermistors(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, active: !t.active } : t);
      const activeChannels = updated.filter(t => t.active).map(t => (t.id + 28).toString());
      const command = activeChannels.join(",") + ";1;1";
      sendCommand(command);
      return updated;
    });
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
      "Resistance T1 (Ω)", 
      "Resistance T2 (Ω)", 
      "Resistance T3 (Ω)", 
      "Resistance T4 (Ω)"
    ];
    const csvContent = [
      headers.join(','),
      ...calibrationLog.map(log => [
        log.calibrationNumber,
        log.time,
        log.measuredTemperature,
        log.measuredResistanceT1 ? log.measuredResistanceT1.toFixed(2) : '',
        log.measuredResistanceT2 ? log.measuredResistanceT2.toFixed(2) : '',
        log.measuredResistanceT3 ? log.measuredResistanceT3.toFixed(2) : '',
        log.measuredResistanceT4 ? log.measuredResistanceT4.toFixed(2) : ''
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

  const handleTimeRangeChange = (_event: Event, newValue: number | number[]) => {
    setTimeRangeValue(newValue as number[]);
  };

  // Compute x-axis domain from visible data and calibration points.
  const liveTimestamps = visibleData.map(d => d.timestamp);
  const calibrationTimestamps = calibrationPoints.map(cp => cp.timestamp);
  const allTimestamps = [...liveTimestamps, ...calibrationTimestamps];
  const domainMin = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
  const domainMax = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;

  // Custom marker render function for the chart.
  const renderCalibrationMarkers = (props: CustomizedComponentProps) => {
    const xAxis = Object.values(props.xAxisMap)[0];
    const yAxis = Object.values(props.yAxisMap)[0];
    return (
      <g>
        {props.calibrationPoints.map((cp: CalibrationPoint, index: number) => {
          const xCoord = xAxis.scale(cp.timestamp);
          const yCoord = yAxis.scale(cp.temperature);
          const yBottom = yAxis.scale(yAxis.domain[0]);
          console.log("Calibration point:", cp, "Coords:", { x: xCoord, y: yCoord });
          return (
            <g key={`calib-${index}`}>
              <line x1={xCoord} y1={yCoord} x2={xCoord} y2={yBottom} stroke={cp.color} strokeDasharray="3 3" />
              <circle cx={xCoord} cy={yCoord} r={4} fill={cp.color} />
            </g>
          );
        })}
      </g>
    );
  };

  // Calibration handler.
  // If averagingTime > 0, average resistance data over that period, then post a calibration log and update temperatures.
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
        sumT1 += thermistorsRef.current[0].active ? thermistorsRef.current[0].resistance : 0;
        sumT2 += thermistorsRef.current[1].active ? thermistorsRef.current[1].resistance : 0;
        sumT3 += thermistorsRef.current[2].active ? thermistorsRef.current[2].resistance : 0;
        sumT4 += thermistorsRef.current[3].active ? thermistorsRef.current[3].resistance : 0;
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
        const newEntry: CalibrationLogEntry = {
          calibrationNumber,
          time: isoTime,
          measuredTemperature: Number(measuredTempInput),
          measuredResistanceT1: thermistorsRef.current[0].active ? avgT1 : 0,
          measuredResistanceT2: thermistorsRef.current[1].active ? avgT2 : 0,
          measuredResistanceT3: thermistorsRef.current[2].active ? avgT3 : 0,
          measuredResistanceT4: thermistorsRef.current[3].active ? avgT4 : 0,
        };
        const newCalibrationPoints = thermistorsRef.current
          .filter(t => t.active)
          .map(t => ({
            time: isoTime,
            timestamp,
            temperature: t.temperature,
            thermistorId: t.id,
            resistance: t.resistance,
            color: t.color,
          }));
        setCalibrationPoints(prev => {
          const newCalibrations = [...prev, ...newCalibrationPoints];
          if (newCalibrations.length > 500) newCalibrations.shift();
          return newCalibrations;
        });
        saveCalibrationEntry(newEntry).then(() => {
          // After calibration, update thermistor temperatures using new coefficients computed from the calibration log.
          setThermistors(prev =>
            prev.map(t => {
              if (!t.active) return t;
              const channel = t.id + 28;
              const coeff = computeCoeffs(channel, calibrationLog);
              let tempC = 0;
              if (t.resistance > 0 && coeff) {
                const lnR = Math.log(t.resistance);
                const tempK = 1 / (coeff.A + coeff.B * lnR + coeff.C * Math.pow(lnR, 2) + coeff.D * Math.pow(lnR, 3));
                tempC = tempK - 273.15;
              }
              return { ...t, temperature: tempC };
            })
          );
        });
        setAveragingInProgress(false);
        setMeasuredTempInput('');
      }, avgTime * 1000);
    } else {
      const calibrationNumber = calibrationLog.length + 1;
      const newEntry: CalibrationLogEntry = {
        calibrationNumber,
        time: isoTime,
        measuredTemperature: Number(measuredTempInput),
        measuredResistanceT1: thermistors[0].active ? thermistors[0].resistance : 0,
        measuredResistanceT2: thermistors[1].active ? thermistors[1].resistance : 0,
        measuredResistanceT3: thermistors[2].active ? thermistors[2].resistance : 0,
        measuredResistanceT4: thermistors[3].active ? thermistors[3].resistance : 0,
      };
      const newCalibrationPoints = thermistorsRef.current
        .filter(t => t.active)
        .map(t => ({
          time: isoTime,
          timestamp,
          temperature: t.temperature,
          thermistorId: t.id,
          resistance: t.resistance,
          color: t.color,
        }));
      setCalibrationPoints(prev => [...prev, ...newCalibrationPoints]);
      saveCalibrationEntry(newEntry).then(() => {
        setThermistors(prev =>
          prev.map(t => {
            if (!t.active) return t;
            const channel = t.id + 28;
            const coeff = computeCoeffs(channel, calibrationLog);
            let tempC = 0;
            if (t.resistance > 0 && coeff) {
              const lnR = Math.log(t.resistance);
              const tempK = 1 / (coeff.A + coeff.B * lnR + coeff.C * Math.pow(lnR, 2) + coeff.D * Math.pow(lnR, 3));
              tempC = tempK - 273.15;
            }
            return { ...t, temperature: tempC };
          })
        );
      });
    }
  };
  
  // Save calibration log entry and return a promise.
  const saveCalibrationEntry = async (entry: CalibrationLogEntry) => {
    const formData = {
      calibration_number: entry.calibrationNumber,
      measured_temperature: Number(entry.measuredTemperature),
      voltage_t1: entry.measuredResistanceT1,
      voltage_t2: entry.measuredResistanceT2,
      voltage_t3: entry.measuredResistanceT3,
      voltage_t4: entry.measuredResistanceT4,
      time: entry.time
    };
    console.log("Calibration log payload:", formData);
    try {
      const res = await fetch(`${API_URL}/calibrations/${id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Server response (${res.status}):`, text);
        throw new Error(`Server responded with ${res.status}: ${res.statusText}`);
      }
      setCalibrationLog(prev => [...prev, entry]);
    } catch (error) {
      console.error("Error saving calibration data:", error);
      setAveragingInProgress(false);
    }
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
          <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }} open={!serialConnected}>
            <Box textAlign="center">
              <Typography variant="h5" gutterBottom>
                Please disconnect any connected ESP32, then connect the USB cable.
              </Typography>
              <Typography variant="body1">Waiting for device connection...</Typography>
              <Button variant="contained" sx={{ mt: 2, mr: 2 }} onClick={handleConnectPort}>Connect Port</Button>
              <Button variant="contained" onClick={handleReturnToDashboard}>Back</Button>
            </Box>
          </Backdrop>
        )}
  
        {serialConnected && (
          <>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" align="center" gutterBottom>
                    Thermistor Controls (PT100 Channels 29–32)
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
                        <TableCell>Resistance (Ω)</TableCell>
                        <TableCell>Temperature (°C)</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {thermistors.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{t.name}</TableCell>
                          <TableCell>{t.active ? t.resistance.toFixed(2) : '-'}</TableCell>
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
                      <LineChart data={visibleData} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
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
                        {thermistors.filter(t => t.active).map(t => (
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
                        <TableCell>R T1 (Ω)</TableCell>
                        <TableCell>R T2 (Ω)</TableCell>
                        <TableCell>R T3 (Ω)</TableCell>
                        <TableCell>R T4 (Ω)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {calibrationLog.map((log) => (
                        <TableRow key={log.calibrationNumber}>
                          <TableCell>{log.calibrationNumber}</TableCell>
                          <TableCell>{new Date(log.time).toLocaleTimeString()}</TableCell>
                          <TableCell>{log.measuredTemperature}</TableCell>
                          <TableCell>{log.measuredResistanceT1 ? log.measuredResistanceT1.toFixed(2) : '-'}</TableCell>
                          <TableCell>{log.measuredResistanceT2 ? log.measuredResistanceT2.toFixed(2) : '-'}</TableCell>
                          <TableCell>{log.measuredResistanceT3 ? log.measuredResistanceT3.toFixed(2) : '-'}</TableCell>
                          <TableCell>{log.measuredResistanceT4 ? log.measuredResistanceT4.toFixed(2) : '-'}</TableCell>
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
