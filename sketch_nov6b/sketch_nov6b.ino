#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <WebSocketsServer.h>
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
WebSocketsServer webSocket = WebSocketsServer(81);

const char* ssid = "aniket_4g";
const char* password = "kolkata2003";

// Motor Layout on Car Chassis:
// Front-Left (FL)  = Motor 4
// Front-Right (FR) = Motor 3
// Rear-Left (RL)   = Motor 2
// Rear-Right (RR)  = Motor 1

// TB6612FNG State Variables
int n20Speed = 180;
bool n20PowerState = true;
String n20Direction = "STOP";

// =========================================================
// TB6612FNG & N20 MOTOR HARDWARE CONTROL FUNCTIONS
// =========================================================
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

  if (dir == "F" || dir == "FWD" || dir == "FORWARD" || dir == "UP") {
    digitalWrite(PIN_AIN1, HIGH);
    digitalWrite(PIN_AIN2, LOW);
    analogWrite(PIN_PWMA, speed);
    n20Direction = "FORWARD";
    Serial.printf("[N20 MOTOR] FORWARD | Speed: %d (PWMA: D1, AIN1: D2=HIGH, AIN2: D4=LOW)\n", speed);
  } else if (dir == "B" || dir == "R" || dir == "REV" || dir == "BACKWARD" || dir == "DOWN") {
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

// Fast, non-blocking motor send to UNO with 2ms pacing
void sendMotorToUno(int motor, int speed, const String& dir) {
  unoSerial.printf("M%d,%d,%s\n", motor, speed, dir.c_str());
  delay(2);
}

// Rapid stop sequence to immediately halt Arduino Uno
void sendStopToUno() {
  unoSerial.println("STOP");
  delay(3);
  unoSerial.println("STOP");
}

// =========================================================
// WEBSOCKET PROTOCOL HANDLER (PORT 81)
// Ultra-low latency communication for the React Cockpit
// =========================================================
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u Disconnected\n", num);
      break;

    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] Client #%u Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      webSocket.sendTXT(num, "CONNECTED: AgriRover Pro Online");
      break;
    }

    case WStype_TEXT: {
      String msg = String((char*)payload);
      msg.trim();

      // 1. Latency Ping-Pong Check
      if (msg == "PING") {
        webSocket.sendTXT(num, "PONG");
        return;
      }

      // 2. Chassis Rover Drive Command: DRIVE:s1,d1,s2,d2,s3,d3,s4,d4
      // s1..s4 = Motor speeds (0-255), d1..d4 = Direction ('F' or 'R')
      // M1=RR, M2=RL, M3=FR, M4=FL
      if (msg.startsWith("DRIVE:")) {
        String params = msg.substring(6);
        int s[4] = {0, 0, 0, 0};
        String d[4] = {"F", "F", "F", "F"};
        int idx = 0;
        int startIdx = 0;

        for (unsigned int i = 0; i <= params.length(); i++) {
          if (i == params.length() || params[i] == ',') {
            String token = params.substring(startIdx, i);
            token.trim();
            if (idx % 2 == 0 && (idx / 2) < 4) {
              s[idx / 2] = constrain(token.toInt(), 0, 255);
            } else if (idx % 2 == 1 && (idx / 2) < 4) {
              d[idx / 2] = (token == "R") ? "R" : "F";
            }
            idx++;
            startIdx = i + 1;
          }
        }

        if (s[0] == 0 && s[1] == 0 && s[2] == 0 && s[3] == 0) {
          sendStopToUno();
        } else {
          sendMotorToUno(4, s[3], d[3]); // Front-Left
          sendMotorToUno(3, s[2], d[2]); // Front-Right
          sendMotorToUno(2, s[1], d[1]); // Rear-Left
          sendMotorToUno(1, s[0], d[0]); // Rear-Right
        }
        webSocket.sendTXT(num, "ACK:DRIVE");
        return;
      }

      // 3. Stop Chassis Rover
      if (msg == "STOP" || msg == "S") {
        sendStopToUno();
        webSocket.sendTXT(num, "ACK:STOP");
        return;
      }

      // 4. Emergency Stop: Stop Rover and N20 Motor
      if (msg == "ESTOP" || msg == "EMERGENCY") {
        sendStopToUno();
        controlN20Motor("STOP", 0, n20PowerState);
        webSocket.sendTXT(num, "ACK:ESTOP");
        return;
      }

      // 5. N20 Motor Control: N20:DIR,SPEED,POWER (e.g. N20:FORWARD,220,1)
      if (msg.startsWith("N20:")) {
        String params = msg.substring(4);
        int c1 = params.indexOf(',');
        int c2 = params.indexOf(',', c1 + 1);

        String dir = (c1 > 0) ? params.substring(0, c1) : params;
        dir.toUpperCase();
        int speed = n20Speed;
        bool pwr = n20PowerState;

        if (c1 > 0) {
          if (c2 > 0) {
            speed = constrain(params.substring(c1 + 1, c2).toInt(), 0, 255);
            pwr = (params.substring(c2 + 1).toInt() != 0);
          } else {
            speed = constrain(params.substring(c1 + 1).toInt(), 0, 255);
          }
        }

        controlN20Motor(dir, speed, pwr);
        String ackN20 = "ACK:N20:" + dir + ":" + String(speed);
        webSocket.sendTXT(num, ackN20);
        return;
      }

      // 6. Telemetry Query
      if (msg == "STATUS" || msg == "TELEM") {
        String statusJson = "STATUS:{\"rssi\":" + String(WiFi.RSSI()) +
                            ",\"heap\":" + String(ESP.getFreeHeap()) +
                            ",\"uptime\":" + String(millis() / 1000) +
                            ",\"n20Dir\":\"" + n20Direction + "\"" +
                            ",\"n20Speed\":" + String(n20Speed) +
                            ",\"n20Power\":" + String(n20PowerState ? "true" : "false") + "}";
        webSocket.sendTXT(num, statusJson);
        return;
      }

      // 7. Generic Raw Uno forwarding
      if (msg.startsWith("UNO:")) {
        String raw = msg.substring(4);
        unoSerial.println(raw);
        String ackUno = "ACK:UNO:" + raw;
        webSocket.sendTXT(num, ackUno);
        return;
      }

      break;
    }

    default:
      break;
  }
}

// =========================================================
// HTTP REST ENDPOINTS (PORT 80)
// Fallback and internal webpage support with CORS enabled
// =========================================================
void handleRoot() {
  Serial.println("[HTTP] Client connected -> Serving RC Rover Pro Dashboard");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send_P(200, "text/html", webpage);
}

void handleStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String json = "{";
  json += "\"status\":\"OK\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"uptime\":" + String(millis() / 1000) + ",";
  json += "\"n20Power\":" + String(n20PowerState ? "true" : "false") + ",";
  json += "\"n20Dir\":\"" + n20Direction + "\",";
  json += "\"n20Speed\":" + String(n20Speed);
  json += "}";
  server.send(200, "application/json", json);
}

void handleCommand() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (!server.hasArg("m") || !server.hasArg("s") || !server.hasArg("d")) {
    server.send(400, "text/plain", "Missing arguments");
    return;
  }

  int motor = server.arg("m").toInt();
  int speed = server.arg("s").toInt();
  String dir = server.arg("d");

  if (motor < 1 || motor > 4 || speed < 0 || speed > 255 || (dir != "F" && dir != "R")) {
    server.send(400, "text/plain", "Invalid command");
    return;
  }

  String cmd = "M" + String(motor) + "," + String(speed) + "," + dir;
  unoSerial.println(cmd);
  server.send(200, "text/plain", "OK: " + cmd);
}

void handleDrive() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  int s1 = constrain(server.arg("s1").toInt(), 0, 255);
  int s2 = constrain(server.arg("s2").toInt(), 0, 255);
  int s3 = constrain(server.arg("s3").toInt(), 0, 255);
  int s4 = constrain(server.arg("s4").toInt(), 0, 255);

  if (s1 == 0 && s2 == 0 && s3 == 0 && s4 == 0) {
    sendStopToUno();
    server.send(200, "text/plain", "ALL MOTORS STOPPED");
    return;
  }

  String d1 = server.arg("d1") == "R" ? "R" : "F";
  String d2 = server.arg("d2") == "R" ? "R" : "F";
  String d3 = server.arg("d3") == "R" ? "R" : "F";
  String d4 = server.arg("d4") == "R" ? "R" : "F";

  sendMotorToUno(4, s4, d4);
  sendMotorToUno(3, s3, d3);
  sendMotorToUno(2, s2, d2);
  sendMotorToUno(1, s1, d1);

  server.send(200, "text/plain", "DRIVE OK");
}

void handleN20() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
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

void handleStopAll() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  sendStopToUno();
  if (server.hasArg("all")) {
    controlN20Motor("STOP", 0, n20PowerState);
    Serial.println("[CMD -> UNO] EMERGENCY STOP (All 4 wheels & N20 motor stopped)");
  } else {
    Serial.println("[CMD -> UNO] STOP (All 4 wheels stopped)");
  }
  server.send(200, "text/plain", "All motors stopped");
}

void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(200, "text/plain", "OK");
}

void handleNotFound() {
  if (server.uri() == "/favicon.ico") {
    server.send(204, "text/plain", "");
    return;
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(404, "text/plain", "Not found");
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

  if (cmd.startsWith("FWD") || cmd.startsWith("F") || cmd.startsWith("UP")) {
    int spd = n20Speed;
    int spaceIdx = cmd.indexOf(' ');
    if (spaceIdx > 0) {
      int parsed = cmd.substring(spaceIdx + 1).toInt();
      if (parsed > 0) spd = parsed;
    }
    controlN20Motor("FORWARD", spd, true);
  } else if (cmd.startsWith("REV") || cmd.startsWith("B") || cmd.startsWith("R") || cmd.startsWith("DOWN")) {
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
  Serial.println("Starting AgriRover Pro Dual Protocol Hub...");
  Serial.println("  Port 80: HTTP REST API & Webpage");
  Serial.println("  Port 81: High-Speed WebSockets");
  Serial.println("==========================================");

  // Wi-Fi Connection with High Performance (Disable Modem Sleep to keep ping under 5ms)
  WiFi.persistent(false);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
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

  // HTTP Routes with CORS
  server.enableCORS(true);
  server.on("/", handleRoot);
  server.on("/status", handleStatus);
  server.on("/cmd", handleCommand);
  server.on("/drive", handleDrive);
  server.on("/stopall", handleStopAll);
  server.on("/n20", handleN20);
  server.on("/drive", HTTP_OPTIONS, handleOptions);
  server.on("/stopall", HTTP_OPTIONS, handleOptions);
  server.on("/n20", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);
  server.begin();

  // WebSocket Server on Port 81
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  Serial.println("AgriRover Pro Servers Ready:");
  Serial.print("  HTTP Dashboard:   http://");
  Serial.println(WiFi.localIP());
  Serial.print("  WebSocket Stream: ws://");
  Serial.print(WiFi.localIP());
  Serial.println(":81");
  Serial.println("==========================================");
}

void loop() {
  server.handleClient();
  webSocket.loop();

  // Forward Arduino Uno Serial feedback to WebSockets & Serial Monitor
  if (unoSerial.available()) {
    String unoMsg = unoSerial.readStringUntil('\n');
    unoMsg.trim();
    // Filter out internal "K" ACK to prevent flooding WebSockets with 100 packets/sec
    if (unoMsg.length() > 0 && unoMsg != "K") {
      Serial.print("[UNO -> ESP] ");
      Serial.println(unoMsg);
      // Stream Uno log to connected React clients
      String broadcastUno = "[UNO] " + unoMsg;
      webSocket.broadcastTXT(broadcastUno);
    }
  }

  // Periodic Telemetry Heartbeat Broadcast (every 1500ms)
  static unsigned long lastTelemetry = 0;
  if (millis() - lastTelemetry > 1500) {
    lastTelemetry = millis();
    if (webSocket.connectedClients() > 0) {
      String telemJson = "TELEMETRY:{\"rssi\":" + String(WiFi.RSSI()) +
                         ",\"heap\":" + String(ESP.getFreeHeap()) +
                         ",\"uptime\":" + String(millis() / 1000) +
                         ",\"n20Dir\":\"" + n20Direction + "\"" +
                         ",\"n20Speed\":" + String(n20Speed) +
                         ",\"n20Power\":" + String(n20PowerState ? "true" : "false") + "}";
      webSocket.broadcastTXT(telemJson);
    }
  }

  // Support direct Serial Monitor commands for debugging
  if (Serial.available()) {
    String serCmd = Serial.readStringUntil('\n');
    serCmd.trim();
    if (serCmd.length() > 0) {
      processSerialN20Command(serCmd);
    }
  }
}
