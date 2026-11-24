#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <SoftwareSerial.h>
#include "webpage.h"

// ============================================================================
// TB6612FNG MOTOR DRIVER & N20 GEAR MOTOR PIN DIAGRAM
// PWMA (Speed)    -> D1   [PWM Speed Control]
// AIN1 (Dir 1)    -> D2   [Direction Logic 1]
// AIN2 (Dir 2)    -> D4   [Direction Logic 2]
// STBY (Standby)  -> D7   [Standby Logic: HIGH = Active, LOW = Standby/Off]
// ============================================================================
#define PIN_PWMA  D1  // PWM Speed Control (GPIO5)
#define PIN_AIN1  D2  // Direction Logic 1 (GPIO4)
#define PIN_AIN2  D4  // Direction Logic 2 (GPIO2)
#define PIN_STBY  D7  // Standby Control   (GPIO13)

// SoftwareSerial to Arduino UNO (for 4WD rover chassis):
// RX = D6 (GPIO12), TX = D5 (GPIO14)
SoftwareSerial unoSerial(D6, D5);

ESP8266WebServer server(80);

const char* ssid = "aniket_4g";
const char* password = "kolkata2003";

// Motor Layout on Car Chassis:
// Front-Left (FL)  = Motor 4
// Front-Right (FR) = Motor 3
// Rear-Left (RL)   = Motor 2
// Rear-Right (RR)  = Motor 1

// Webpage dashboard HTML/CSS/JavaScript is separated into webpage.h


void handleRoot() {
  Serial.println("[HTTP] Client connected -> Serving RC Rover Pro Dashboard");
  server.send_P(200, "text/html", webpage);
}

// Single motor endpoint: /cmd?m=1&s=200&d=F
void handleCommand() {
  if (!server.hasArg("m") ||
      !server.hasArg("s") ||
      !server.hasArg("d")) {
    Serial.println("[ERROR] /cmd called with missing arguments");
    server.send(400, "text/plain", "Missing arguments");
    return;
  }

  int motor = server.arg("m").toInt();
  int speed = server.arg("s").toInt();
  String dir = server.arg("d");

  if (motor < 1 || motor > 4 ||
      speed < 0 || speed > 255 ||
      (dir != "F" && dir != "R")) {
    Serial.printf("[ERROR] Invalid command params: m=%d, s=%d, d=%s\n", motor, speed, dir.c_str());
    server.send(400, "text/plain", "Invalid command");
    return;
  }

  String cmd = "M" + String(motor) + "," + String(speed) + "," + dir;
  unoSerial.println(cmd);

  Serial.print("[CMD -> UNO] ");
  Serial.println(cmd);

  server.send(200, "text/plain", "OK: " + cmd);
}

// Helper: send a single motor command to UNO and wait until UNO finishes
// processing/printing (or replies with '\n', up to 70ms max) so UNO SoftwareSerial
// never drops M2 and M1 while busy with M4 and M3.
void sendMotorToUno(int motor, int speed, const String& dir) {
  while (unoSerial.available()) {
    unoSerial.read();
  }

  unoSerial.printf("M%d,%d,%s\n", motor, speed, dir.c_str());
  unoSerial.flush();

  unsigned long start = millis();
  while (millis() - start < 35) {
    if (unoSerial.available()) {
      char c = unoSerial.read();
      if (c == '\n') {
        delay(2);
        break;
      }
    }
    yield();
  }
}

// Robust stop sequence to ensure Arduino Uno receives and executes the stop command
void sendStopToUno() {
  while (unoSerial.available()) {
    unoSerial.read();
  }
  // Send multiple STOP signals with small delay to prevent SoftwareSerial packet drops
  unoSerial.println("STOP");
  delay(10);
  unoSerial.println("STOP");
  delay(10);
  unoSerial.println("M1,0,F");
  delay(4);
  unoSerial.println("M2,0,F");
  delay(4);
  unoSerial.println("M3,0,F");
  delay(4);
  unoSerial.println("M4,0,F");
  delay(4);
  unoSerial.println("STOP");
  unoSerial.flush();
}

// Synchronized 4-wheel car drive endpoint:
// /drive?s1=200&d1=F&s2=200&d2=F&s3=200&d3=F&s4=200&d4=F
// Motor 4 = Front-Left, Motor 3 = Front-Right, Motor 2 = Rear-Left, Motor 1 = Rear-Right
void handleDrive() {
  int s1 = constrain(server.arg("s1").toInt(), 0, 255);
  int s2 = constrain(server.arg("s2").toInt(), 0, 255);
  int s3 = constrain(server.arg("s3").toInt(), 0, 255);
  int s4 = constrain(server.arg("s4").toInt(), 0, 255);

  // If all speeds are zero, route directly to stopAll for an immediate complete shutdown
  if (s1 == 0 && s2 == 0 && s3 == 0 && s4 == 0) {
    sendStopToUno();
    Serial.println("[CAR -> UNO] ALL STOPPED (Speed = 0)");
    server.send(200, "text/plain", "ALL MOTORS STOPPED");
    return;
  }

  String d1 = server.arg("d1") == "R" ? "R" : "F";
  String d2 = server.arg("d2") == "R" ? "R" : "F";
  String d3 = server.arg("d3") == "R" ? "R" : "F";
  String d4 = server.arg("d4") == "R" ? "R" : "F";

  // Send all 4 motor commands cleanly to Arduino UNO with handshake timing
  // Front-Left (M4), Front-Right (M3), Rear-Left (M2), Rear-Right (M1)
  sendMotorToUno(4, s4, d4);
  sendMotorToUno(3, s3, d3);
  sendMotorToUno(2, s2, d2);
  sendMotorToUno(1, s1, d1);

  Serial.printf("[CAR -> UNO] FL(M4):%d%s | FR(M3):%d%s | RL(M2):%d%s | RR(M1):%d%s\n",
                s4, d4.c_str(), s3, d3.c_str(), s2, d2.c_str(), s1, d1.c_str());

  server.send(200, "text/plain", "DRIVE OK");
}

// =========================================================
// TB6612FNG & N20 MOTOR HARDWARE CONTROL FUNCTIONS
// =========================================================
int n20Speed = 180;
bool n20PowerState = true;
String n20Direction = "STOP";

void initTB6612FNG() {
  pinMode(PIN_PWMA, OUTPUT);
  pinMode(PIN_AIN1, OUTPUT);
  pinMode(PIN_AIN2, OUTPUT);
  pinMode(PIN_STBY, OUTPUT);

  // Initialize TB6612FNG with standby enabled, motor stopped
  digitalWrite(PIN_STBY, HIGH);
  digitalWrite(PIN_AIN1, LOW);
  digitalWrite(PIN_AIN2, LOW);
  analogWrite(PIN_PWMA, 0);

  Serial.println("[TB6612FNG] N20 Motor Initialized:");
  Serial.println("  PWMA (Speed)   -> D1 [PWM Speed Control]");
  Serial.println("  AIN1 (Dir 1)   -> D2 [Direction Logic 1]");
  Serial.println("  AIN2 (Dir 2)   -> D4 [Direction Logic 2]");
  Serial.println("  STBY (Standby) -> D7 [Standby Logic]");
}

void controlN20Motor(const String& dir, int speed, bool power) {
  n20PowerState = power;
  if (!n20PowerState) {
    digitalWrite(PIN_STBY, LOW); // Cut power / put TB6612FNG into Standby
    digitalWrite(PIN_AIN1, LOW);
    digitalWrite(PIN_AIN2, LOW);
    analogWrite(PIN_PWMA, 0);
    n20Direction = "OFF";
    Serial.println("[N20 MOTOR] Power OFF (STBY = LOW)");
    return;
  }

  // Ensure STBY is HIGH (active)
  digitalWrite(PIN_STBY, HIGH);

  speed = constrain(speed, 0, 255);
  n20Speed = speed;

  if (dir == "F" || dir == "FWD" || dir == "FORWARD") {
    digitalWrite(PIN_AIN1, HIGH);
    digitalWrite(PIN_AIN2, LOW);
    analogWrite(PIN_PWMA, speed);
    n20Direction = "FORWARD";
    Serial.printf("[N20 MOTOR] FORWARD | Speed: %d (PWMA: D1, AIN1: D2=HIGH, AIN2: D4=LOW)\n", speed);
  } else if (dir == "B" || dir == "R" || dir == "REV" || dir == "BACKWARD") {
    digitalWrite(PIN_AIN1, LOW);
    digitalWrite(PIN_AIN2, HIGH);
    analogWrite(PIN_PWMA, speed);
    n20Direction = "BACKWARD";
    Serial.printf("[N20 MOTOR] BACKWARD | Speed: %d (PWMA: D1, AIN1: D2=LOW, AIN2: D4=HIGH)\n", speed);
  } else { // STOP / BRAKE
    digitalWrite(PIN_AIN1, LOW);
    digitalWrite(PIN_AIN2, LOW);
    analogWrite(PIN_PWMA, 0);
    n20Direction = "STOP";
    Serial.println("[N20 MOTOR] STOPPED (PWMA: D1=0, AIN1: D2=LOW, AIN2: D4=LOW)");
  }
}

// Endpoint: /n20?dir=F&speed=180&power=1
// Also supports /n20?action=forward / backward / stop / on / off
void handleN20() {
  bool power = n20PowerState;
  if (server.hasArg("power")) {
    int p = server.arg("power").toInt();
    power = (p != 0);
  }

  int speed = n20Speed;
  if (server.hasArg("speed")) {
    speed = constrain(server.arg("speed").toInt(), 0, 255);
  }

  String dir = n20Direction;
  if (server.hasArg("dir")) {
    dir = server.arg("dir");
    dir.toUpperCase();
  } else if (server.hasArg("action")) {
    dir = server.arg("action");
    dir.toUpperCase();
  }

  controlN20Motor(dir, speed, power);

  String resp = "OK: N20 Motor power=" + String(power ? "1" : "0") +
                " dir=" + dir + " speed=" + String(speed);
  server.send(200, "text/plain", resp);
}

void processSerialN20Command(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "HELP" || cmd == "?") {
    Serial.println("--- N20 TB6612FNG Serial Commands ---");
    Serial.println("  N20 FWD [speed]   -> Run Forward (e.g. N20 FWD 200)");
    Serial.println("  N20 REV [speed]   -> Run Backward (e.g. N20 REV 200)");
    Serial.println("  N20 STOP          -> Stop motor");
    Serial.println("  N20 ON            -> Enable STBY (Power ON)");
    Serial.println("  N20 OFF           -> Disable STBY (Power OFF)");
    Serial.println("  N20 SPEED [val]   -> Set speed (0-255)");
    Serial.println("-------------------------------------");
    return;
  }

  if (cmd.startsWith("N20")) {
    cmd = cmd.substring(3);
    cmd.trim();
  }

  if (cmd.startsWith("FWD") || cmd.startsWith("F")) {
    int spd = n20Speed;
    int spaceIdx = cmd.indexOf(' ');
    if (spaceIdx > 0) {
      int parsed = cmd.substring(spaceIdx + 1).toInt();
      if (parsed > 0) spd = parsed;
    }
    controlN20Motor("FORWARD", spd, true);
  } else if (cmd.startsWith("REV") || cmd.startsWith("B") || cmd.startsWith("R")) {
    int spd = n20Speed;
    int spaceIdx = cmd.indexOf(' ');
    if (spaceIdx > 0) {
      int parsed = cmd.substring(spaceIdx + 1).toInt();
      if (parsed > 0) spd = parsed;
    }
    controlN20Motor("BACKWARD", spd, true);
  } else if (cmd == "STOP" || cmd == "S") {
    sendStopToUno();
    controlN20Motor("STOP", 0, n20PowerState);
    Serial.println("[ALL] All 4 wheels & N20 motor stopped");
  } else if (cmd == "ON") {
    controlN20Motor(n20Direction == "OFF" ? "STOP" : n20Direction, n20Speed, true);
  } else if (cmd == "OFF") {
    controlN20Motor("STOP", 0, false);
  } else if (cmd.startsWith("SPEED")) {
    int spaceIdx = cmd.indexOf(' ');
    if (spaceIdx > 0) {
      int spd = cmd.substring(spaceIdx + 1).toInt();
      n20Speed = constrain(spd, 0, 255);
      if (n20Direction == "FORWARD" || n20Direction == "BACKWARD") {
        controlN20Motor(n20Direction, n20Speed, n20PowerState);
      } else {
        Serial.printf("[N20 MOTOR] Speed preset updated to %d\n", n20Speed);
      }
    }
  }
}

void handleStopAll() {
  sendStopToUno();
  if (server.hasArg("all")) {
    controlN20Motor("STOP", 0, n20PowerState);
    Serial.println("[CMD -> UNO] EMERGENCY STOP (All 4 wheels & N20 motor stopped)");
  } else {
    Serial.println("[CMD -> UNO] STOP (All 4 wheels stopped)");
  }
  server.send(200, "text/plain", "All motors stopped");
}

void handleNotFound() {
  if (server.uri() == "/favicon.ico") {
    server.send(204, "text/plain", "");
    return;
  }
  Serial.print("[HTTP 404] Unknown path: ");
  Serial.println(server.uri());
  server.send(404, "text/plain", "Not found");
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(20);
  unoSerial.begin(9600);
  unoSerial.setTimeout(20);
  delay(500);

  // Setup ESP8266 PWM range (0-255) and frequency (1kHz)
  analogWriteRange(255);
  analogWriteFreq(1000);

  // Initialize TB6612FNG Driver for N20 Motor
  initTB6612FNG();

  Serial.println();
  Serial.println("==========================================");
  Serial.println("Starting ESP8266 RC Rover Pro Dashboard...");
  Serial.println("Front: M4 (Left), M3 (Right)");
  Serial.println("Rear:  M2 (Left), M1 (Right)");
  Serial.println("N20 Motor (TB6612FNG): D1, D2, D4, D7");
  Serial.println("==========================================");

  // Clear previous AP settings and connect to Wi-Fi router
  WiFi.persistent(false);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts % 20 == 0) {
      Serial.println();
      Serial.print("Still trying to connect to ");
      Serial.print(ssid);
      Serial.print(" (Status code: ");
      Serial.print(WiFi.status());
      Serial.println(")...");
    }
  }

  Serial.println();
  Serial.println("------------------------------------------");
  Serial.println("Wi-Fi Connected Successfully!");
  Serial.print("SSID:       ");
  Serial.println(WiFi.SSID());
  Serial.print("Signal:     ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  Serial.print("IP Address: http://");
  Serial.println(WiFi.localIP());
  Serial.println("------------------------------------------");

  server.on("/", handleRoot);
  server.on("/cmd", handleCommand);
  server.on("/drive", handleDrive);
  server.on("/stopall", handleStopAll);
  server.on("/n20", handleN20);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("RC Rover Pro Web Server Started!");
  Serial.print("Open this URL in your browser: http://");
  Serial.println(WiFi.localIP());
}

void loop() {
  server.handleClient();

  // If Arduino Uno sends any feedback over serial, print it to Serial Monitor
  if (unoSerial.available()) {
    String unoMsg = unoSerial.readStringUntil('\n');
    unoMsg.trim();
    if (unoMsg.length() > 0) {
      Serial.print("[UNO -> ESP] ");
      Serial.println(unoMsg);
    }
  }

  // Also support testing N20 motor directly from USB Serial Monitor
  if (Serial.available()) {
    String serCmd = Serial.readStringUntil('\n');
    serCmd.trim();
    if (serCmd.length() > 0) {
      processSerialN20Command(serCmd);
    }
  }
}
