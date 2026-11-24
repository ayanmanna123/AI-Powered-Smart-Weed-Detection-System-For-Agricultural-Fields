#include <SoftwareSerial.h>

// RX = A2 (connect to ESP8266 D5 TX)
// TX = A3 (connect to ESP8266 D6 RX via voltage divider)
SoftwareSerial espSerial(A2, A3);

// =========================================================
// 4WD RC CAR MOTOR LAYOUT
// Front-Left (FL)  = Motor 4 (L298N #2 ENB)
// Front-Right (FR) = Motor 3 (L298N #2 ENA)
// Rear-Left (RL)   = Motor 2 (L298N #1 ENB)
// Rear-Right (RR)  = Motor 1 (L298N #1 ENA)
// =========================================================

// Motor 1 — Rear-Right (RR)
#define ENA1 3
#define IN1  2
#define IN2  4

// Motor 2 — Rear-Left (RL)
#define ENB1 5
#define IN3  7
#define IN4  8

// Motor 3 — Front-Right (FR)
#define ENA2 6
#define IN5  10
#define IN6  12

// Motor 4 — Front-Left (FL)
#define ENB2 9
#define IN7  13
#define IN8  A0

void setup() {
  Serial.begin(9600);
  espSerial.begin(9600);
  espSerial.setTimeout(50); // Prevent 1000ms blocking timeout on serial read
  Serial.setTimeout(50);

  int pins[] = {
    ENA1, IN1, IN2,
    ENB1, IN3, IN4,
    ENA2, IN5, IN6,
    ENB2, IN7, IN8
  };

  for (int pin : pins) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }

  stopAll();
  Serial.println("==========================================");
  Serial.println("Arduino UNO: 4WD RC Car Controller Ready");
  Serial.println("Front: M4 (Left), M3 (Right)");
  Serial.println("Rear:  M2 (Left), M1 (Right)");
  Serial.println("==========================================");
}

void setMotorPins(int motor, int speed, char dir) {
  speed = constrain(speed, 0, 255);

  int en, inA, inB;
  switch (motor) {
    case 1: en = ENA1; inA = IN1; inB = IN2; break; // Rear-Right
    case 2: en = ENB1; inA = IN3; inB = IN4; break; // Rear-Left
    case 3: en = ENA2; inA = IN5; inB = IN6; break; // Front-Right
    case 4: en = ENB2; inA = IN7; inB = IN8; break; // Front-Left
    default: return;
  }

  if (speed == 0) {
    digitalWrite(inA, LOW);
    digitalWrite(inB, LOW);
    analogWrite(en, 0);
    digitalWrite(en, LOW);
  } else if (dir == 'F') {
    digitalWrite(inA, HIGH);
    digitalWrite(inB, LOW);
    analogWrite(en, speed);
  } else if (dir == 'R') {
    digitalWrite(inA, LOW);
    digitalWrite(inB, HIGH);
    analogWrite(en, speed);
  }
}

void motorControl(int motor, int speed, char dir) {
  setMotorPins(motor, speed, dir);

  const char* pos = (motor == 4) ? "FL" : (motor == 3) ? "FR" : (motor == 2) ? "RL" : "RR";
  Serial.print("[M");
  Serial.print(motor);
  Serial.print(" ");
  Serial.print(pos);
  Serial.print("] ");
  Serial.print(speed == 0 ? 'S' : dir);
  Serial.print(" ");
  Serial.println(speed);
  // Note: Do not transmit on half-duplex SoftwareSerial here, otherwise
  // consecutive M4..M1 commands from ESP8266 collide with outgoing TX bits.
}

void stopAll() {
  for (int m = 1; m <= 4; m++) {
    setMotorPins(m, 0, 'F');
  }
  Serial.println("[STOP] All 4 wheels stopped");
}

void processCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  cmd.toUpperCase();
  if (cmd.indexOf("STOP") >= 0 || cmd == "S") {
    stopAll();
    return;
  }

  // Atomic 4-motor command: ALL,speed,F (or ALL,speed,R)
  if (cmd.startsWith("ALL,")) {
    int first = cmd.indexOf(',');
    int second = cmd.indexOf(',', first + 1);
    if (first > 0 && second > first) {
      int speed = constrain(cmd.substring(first + 1, second).toInt(), 0, 255);
      char direction = cmd.charAt(second + 1);
      if (direction == 'F' || direction == 'R') {
        for (int m = 1; m <= 4; m++) {
          setMotorPins(m, speed, direction);
        }
        Serial.print("[ALL] ");
        Serial.print(direction);
        Serial.print(" ");
        Serial.println(speed);
      }
    }
    return;
  }

  // Format: M1,150,F
  if (cmd.startsWith("M")) {
    int first = cmd.indexOf(',');
    int second = cmd.indexOf(',', first + 1);
    if (first < 0 || second < 0) return;

    int motor = cmd.substring(1, first).toInt();
    int speed = cmd.substring(first + 1, second).toInt();
    char direction = cmd.charAt(second + 1);

    if (motor >= 1 && motor <= 4 &&
        speed >= 0 && speed <= 255 &&
        (direction == 'F' || direction == 'R')) {
      motorControl(motor, speed, direction);
    }
  }
}

void loop() {
  // Process commands from ESP8266 over SoftwareSerial (A2/A3)
  while (espSerial.available()) {
    String command = espSerial.readStringUntil('\n');
    processCommand(command);
  }

  // Also allow testing commands directly from UNO USB Serial Monitor
  while (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    processCommand(command);
  }
}
