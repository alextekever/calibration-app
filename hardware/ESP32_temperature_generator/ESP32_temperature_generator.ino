#include <Arduino.h>
#include <math.h>

const float baseVoltage = 1.42;  // Midpoint between 0.8 and 2.04 V
const float amplitude = 0.62;    // Half the range: (2.04 - 0.8) / 2
const unsigned long interval = 500;  // 2 seconds
unsigned long previousMillis = 0;
float phase = 0.0;
const float phaseIncrement = 0.1;  // Adjust for sine wave frequency

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    float voltages[4];
    for (int i = 0; i < 4; i++) {
      // Offset phase for each sensor
      float sensorPhase = phase + (i * 0.5);
      // Calculate sine value plus a little noise (±0.05 V)
      float noise = ((random(-50, 50)) / 1000.0);
      voltages[i] = baseVoltage + amplitude * sin(sensorPhase) + noise;
      voltages[i] = constrain(voltages[i], 0.8, 2.04);
    }
    phase += phaseIncrement;
    
    // Send the 4 values as comma-separated string, ending with newline.
    Serial.print(voltages[0], 3);
    for (int i = 1; i < 4; i++) {
      Serial.print(",");
      Serial.print(voltages[i], 3);
    }
    Serial.println();  // This sends a newline character.
  }
}
