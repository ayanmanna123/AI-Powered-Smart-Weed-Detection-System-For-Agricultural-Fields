#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <SoftwareSerial.h>

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

const char webpage[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>RC Rover Pro | 4WD Telemetry & Control</title>
<style>
  :root {
    --bg: #0b0f19;
    --panel: #111827;
    --card: #1f2937;
    --border: #374151;
    --accent: #38bdf8;
    --accent-glow: rgba(56, 189, 248, 0.35);
    --green: #10b981;
    --blue: #3b82f6;
    --amber: #f59e0b;
    --red: #ef4444;
    --text: #f9fafb;
    --muted: #9ca3af;
  }

  * {
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  body {
    margin: 0;
    padding: 12px;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: radial-gradient(circle at top, #172554 0%, var(--bg) 55%);
    color: var(--text);
    min-height: 100vh;
  }

  .container {
    max-width: 1080px;
    margin: 0 auto;
  }

  /* Header & Telemetry Bar */
  .topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: rgba(17, 24, 39, 0.9);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 12px 18px;
    margin-bottom: 14px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.4);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #0284c7, #38bdf8);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: bold;
    box-shadow: 0 0 15px var(--accent-glow);
  }

  .brand h1 {
    margin: 0;
    font-size: 1.2rem;
    letter-spacing: 0.5px;
    color: var(--accent);
  }

  .brand p {
    margin: 2px 0 0;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .telemetry {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .badge {
    background: var(--card);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
  }

  .state-pill {
    background: rgba(56, 189, 248, 0.15);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  /* Main Dashboard Grid */
  .main-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 14px;
  }

  @media (max-width: 820px) {
    .main-grid {
      grid-template-columns: 1fr;
    }
  }

  .panel {
    background: rgba(17, 24, 39, 0.92);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.6);
  }

  .panel-title {
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #e5e7eb;
  }

  /* Mode Switcher */
  .mode-tabs {
    display: flex;
    background: var(--card);
    border-radius: 10px;
    padding: 3px;
    gap: 4px;
  }

  .tab-btn {
    border: none;
    background: transparent;
    color: var(--muted);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn.active {
    background: var(--accent);
    color: #0b0f19;
    font-weight: 700;
  }

  /* Speed & Gear Controls */
  .speed-box {
    background: var(--card);
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 14px;
    border: 1px solid var(--border);
  }

  .speed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.88rem;
  }

  .speed-val {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--accent);
  }

  input[type="range"] {
    width: 100%;
    height: 8px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .gears {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 10px;
  }

  .gear-btn {
    padding: 8px 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #111827;
    color: var(--text);
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
    transition: 0.15s;
  }

  .gear-btn.active {
    border-color: var(--accent);
    background: rgba(56, 189, 248, 0.2);
    color: var(--accent);
  }

  /* 8-Way Tactical D-Pad */
  .dpad-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    max-width: 340px;
    margin: 0 auto;
  }

  .ctrl-btn {
    height: 76px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: linear-gradient(180deg, #273549, #1e293b);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    box-shadow: 0 5px 15px rgba(0,0,0,0.35);
    transition: transform 0.08s, background 0.12s, border-color 0.12s;
    touch-action: none;
  }

  .ctrl-btn .arrow {
    font-size: 1.5rem;
    line-height: 1;
  }

  .ctrl-btn .lbl {
    font-size: 0.7rem;
    font-weight: 700;
    color: #cbd5e1;
    letter-spacing: 0.4px;
  }

  .ctrl-btn:active, .ctrl-btn.pressed {
    transform: scale(0.95);
    border-color: var(--accent);
    background: linear-gradient(180deg, #0284c7, #0369a1);
    box-shadow: 0 0 18px var(--accent-glow);
  }

  .ctrl-btn.primary-dir {
    background: linear-gradient(180deg, #1d4ed8, #1e3a8a);
    border-color: #3b82f6;
  }

  .ctrl-btn.stop-center {
    background: linear-gradient(180deg, #dc2626, #991b1b);
    border-color: #ef4444;
  }

  .ctrl-btn.stop-center:active, .ctrl-btn.stop-center.pressed {
    background: #ef4444;
    box-shadow: 0 0 22px rgba(239, 68, 68, 0.6);
  }

  /* Virtual Joystick */
  #joystickWrap {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 0;
  }

  .joy-base {
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, #1e293b 0%, #0f172a 75%);
    border: 2px solid var(--border);
    position: relative;
    box-shadow: inset 0 0 25px rgba(0,0,0,0.7), 0 0 20px rgba(56, 189, 248, 0.12);
    touch-action: none;
  }

  .joy-cross-h, .joy-cross-v {
    position: absolute;
    background: rgba(148, 163, 184, 0.15);
    pointer-events: none;
  }
  .joy-cross-h { width: 100%; height: 1px; top: 50%; left: 0; }
  .joy-cross-v { height: 100%; width: 1px; left: 50%; top: 0; }

  .joy-stick {
    width: 74px;
    height: 74px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #38bdf8, #0284c7);
    border: 3px solid #bae6fd;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 6px 20px rgba(0,0,0,0.6), 0 0 18px var(--accent-glow);
    pointer-events: none;
  }

  /* 4WD Car Chassis Visualizer */
  .chassis-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 14px;
  }

  .car-layout {
    display: grid;
    grid-template-columns: 1fr 90px 1fr;
    grid-template-rows: auto auto;
    gap: 14px 10px;
    align-items: center;
    width: 100%;
    max-width: 390px;
  }

  .wheel-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px;
    text-align: center;
    position: relative;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .wheel-card.active-fwd {
    border-color: var(--green);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.25);
  }

  .wheel-card.active-rev {
    border-color: var(--amber);
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
  }

  .wheel-title {
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--accent);
  }

  .wheel-sub {
    font-size: 0.68rem;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .wheel-stat {
    font-size: 0.85rem;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    background: #111827;
    display: inline-block;
    margin-bottom: 6px;
  }

  .inv-btn {
    display: block;
    width: 100%;
    padding: 4px;
    font-size: 0.68rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #111827;
    color: var(--muted);
    cursor: pointer;
  }

  .inv-btn.inverted {
    background: rgba(245, 158, 11, 0.2);
    border-color: var(--amber);
    color: var(--amber);
    font-weight: 700;
  }

  .car-body {
    grid-column: 2;
    grid-row: 1 / span 2;
    height: 185px;
    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
    border: 2px solid #475569;
    border-radius: 26px 26px 16px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 12px 6px;
    position: relative;
    box-shadow: inset 0 0 15px rgba(0,0,0,0.6);
  }

  .car-front-badge {
    font-size: 0.65rem;
    font-weight: 800;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    padding: 3px 8px;
    border-radius: 99px;
    border: 1px solid rgba(56, 189, 248, 0.4);
  }

  .car-arrow {
    font-size: 1.8rem;
    color: var(--accent);
    transition: transform 0.2s;
  }

  .car-rear-badge {
    font-size: 0.62rem;
    color: var(--muted);
    font-weight: 700;
  }

  /* Emergency Stop Button */
  .estop-btn {
    width: 100%;
    padding: 14px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(90deg, #dc2626, #b91c1c);
    color: white;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.8px;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
    margin-top: 12px;
  }

  .estop-btn:active {
    transform: scale(0.98);
  }

  /* Individual Motor Testing Section */
  .motors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 12px;
    margin-top: 14px;
  }

  .m-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px;
  }

  .m-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .m-card-head h4 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--accent);
  }

  .m-card-head span {
    font-size: 0.72rem;
    color: var(--muted);
    background: #111827;
    padding: 2px 7px;
    border-radius: 6px;
  }

  .m-btns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-top: 8px;
  }

  .m-btn {
    padding: 8px 4px;
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .m-btn.fwd { background: var(--green); }
  .m-btn.rev { background: var(--blue); }
  .m-btn.stp { background: var(--red); }

  .hint-bar {
    text-align: center;
    font-size: 0.76rem;
    color: var(--muted);
    margin-top: 10px;
  }
  kbd {
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.72rem;
    color: #e2e8f0;
  }

  /* Auto Drive (Distance / Time) Section */
  .auto-drive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    align-items: end;
  }
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-group label {
    font-size: 0.78rem;
    font-weight: 700;
    color: #cbd5e1;
  }
  .field-input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #111827;
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
    outline: none;
    user-select: text;
    -webkit-user-select: text;
  }
  .field-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }
  .submit-run-btn {
    width: 100%;
    padding: 11px 16px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: 0.5px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35);
    transition: transform 0.1s, opacity 0.2s;
  }
  .submit-run-btn:active {
    transform: scale(0.97);
  }
  .auto-status {
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--card);
    border: 1px solid var(--border);
    font-size: 0.82rem;
    color: var(--accent);
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* N20 Motor & TB6612FNG Driver Bench Test Styles */
  .n20-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    align-items: stretch;
  }
  @media (max-width: 760px) {
    .n20-grid {
      grid-template-columns: 1fr;
    }
  }
  .pin-badge-row {
    background: #111827;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    font-size: 0.76rem;
    align-items: center;
  }
  .pin-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
  }
  .pin-pill {
    padding: 2px 7px;
    border-radius: 5px;
    font-weight: 800;
    font-size: 0.72rem;
  }
  .btn-power-on {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.84rem;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    transition: transform 0.08s, opacity 0.15s;
  }
  .btn-power-on:active { transform: scale(0.97); }
  .btn-power-off {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.84rem;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    transition: transform 0.08s, opacity 0.15s;
  }
  .btn-power-off:active { transform: scale(0.97); }
</style>
</head>
<body>

<div class="container">
  <!-- Top Bar -->
  <div class="topbar">
    <div class="brand">
      <div class="brand-icon">4WD</div>
      <div>
        <h1>RC ROVER PRO</h1>
        <p>Front: M4 (Left) &amp; M3 (Right) &bull; Rear: M2 (Left) &amp; M1 (Right)</p>
      </div>
    </div>

    <div class="telemetry">
      <div class="badge state-pill" id="driveStateBadge">STATE: STOPPED</div>
      <div class="badge">
        <span class="dot" id="connDot"></span>
        <span id="connText">READY</span>
      </div>
    </div>
  </div>

  <!-- Main 2-Column Cockpit -->
  <div class="main-grid">

    <!-- Left Column: Drive Controls -->
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Cockpit Controls</span>
        <div class="mode-tabs">
          <button class="tab-btn active" id="tabDpad" onclick="switchPad('dpad'); this.blur();">D-PAD</button>
          <button class="tab-btn" id="tabJoy" onclick="switchPad('joy'); this.blur();">JOYSTICK</button>
          <button class="tab-btn active" id="tabHold" onclick="toggleHoldMode(); this.blur();">MODE: TAP</button>
        </div>
      </div>

      <!-- Master Speed & Gear Box -->
      <div class="speed-box">
        <div class="speed-header">
          <span>Master Throttle Speed</span>
          <span class="speed-val"><span id="masterSpeedVal">200</span> / 255</span>
        </div>
        <input type="range" id="masterSpeed" min="60" max="255" value="200" oninput="updateMasterSpeed(this.value)">
        <div class="gears">
          <button class="gear-btn" id="gear1" onclick="setGear(110, 1)">1: ECO</button>
          <button class="gear-btn" id="gear2" onclick="setGear(165, 2)">2: NORM</button>
          <button class="gear-btn active" id="gear3" onclick="setGear(200, 3)">3: SPORT</button>
          <button class="gear-btn" id="gear4" onclick="setGear(255, 4)">4: TURBO</button>
        </div>
      </div>

      <!-- 8-Way Tactical D-Pad -->
      <div id="dpadWrap">
        <div class="dpad-grid">
          <button class="ctrl-btn" data-move="FL">
            <span class="arrow">&#8598;</span>
            <span class="lbl">CURVE FL</span>
          </button>
          <button class="ctrl-btn primary-dir" data-move="F">
            <span class="arrow">&#9650;</span>
            <span class="lbl">FORWARD</span>
          </button>
          <button class="ctrl-btn" data-move="FR">
            <span class="arrow">&#8599;</span>
            <span class="lbl">CURVE FR</span>
          </button>

          <button class="ctrl-btn primary-dir" data-move="L">
            <span class="arrow">&#8634;</span>
            <span class="lbl">SPIN LEFT</span>
          </button>
          <button class="ctrl-btn stop-center" onclick="stopAll()">
            <span class="arrow">&#9632;</span>
            <span class="lbl">STOP</span>
          </button>
          <button class="ctrl-btn primary-dir" data-move="R">
            <span class="arrow">&#8635;</span>
            <span class="lbl">SPIN RIGHT</span>
          </button>

          <button class="ctrl-btn" data-move="BL">
            <span class="arrow">&#8601;</span>
            <span class="lbl">CURVE BL</span>
          </button>
          <button class="ctrl-btn primary-dir" data-move="B">
            <span class="arrow">&#9660;</span>
            <span class="lbl">REVERSE</span>
          </button>
          <button class="ctrl-btn" data-move="BR">
            <span class="arrow">&#8600;</span>
            <span class="lbl">CURVE BR</span>
          </button>
        </div>
      </div>

      <!-- 360° Touch Joystick -->
      <div id="joystickWrap">
        <div class="joy-base" id="joyBase">
          <div class="joy-cross-h"></div>
          <div class="joy-cross-v"></div>
          <div class="joy-stick" id="joyStick"></div>
        </div>
        <p class="hint-bar">Drag joystick in any direction &bull; Release to auto-stop</p>
      </div>

      <button class="estop-btn" onclick="stopAll()">&#9888; EMERGENCY STOP ALL MOTORS (SPACE)</button>
      <div class="hint-bar">
        Keyboard: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> to Drive &bull; <kbd>Space</kbd> Stop &bull; <kbd>1</kbd>-<kbd>4</kbd> Gears
      </div>
    </div>

    <!-- Right Column: 4WD Chassis Telemetry & Polarity Calibration -->
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Live 4WD Chassis &amp; Wheel Trim</span>
        <span style="font-size:0.74rem;color:var(--muted);">Flip if a motor spins backwards</span>
      </div>

      <div class="chassis-wrap">
        <div class="car-layout">
          <!-- Front Left: Motor 4 -->
          <div class="wheel-card" id="wcard4">
            <div class="wheel-title">FRONT LEFT</div>
            <div class="wheel-sub">Motor 4 (ENB2/D9)</div>
            <div class="wheel-stat" id="wstat4">STOP (0)</div>
            <button class="inv-btn" id="invBtn4" onclick="toggleInvert(4)">&#8644; Normal Polarity</button>
          </div>

          <!-- Center Car Body -->
          <div class="car-body">
            <div class="car-front-badge">&uarr; FRONT &uarr;</div>
            <div class="car-arrow" id="carArrow">&#9679;</div>
            <div class="car-rear-badge">REAR</div>
          </div>

          <!-- Front Right: Motor 3 -->
          <div class="wheel-card" id="wcard3">
            <div class="wheel-title">FRONT RIGHT</div>
            <div class="wheel-sub">Motor 3 (ENA2/D6)</div>
            <div class="wheel-stat" id="wstat3">STOP (0)</div>
            <button class="inv-btn" id="invBtn3" onclick="toggleInvert(3)">&#8644; Normal Polarity</button>
          </div>

          <!-- Rear Left: Motor 2 -->
          <div class="wheel-card" id="wcard2">
            <div class="wheel-title">REAR LEFT</div>
            <div class="wheel-sub">Motor 2 (ENB1/D5)</div>
            <div class="wheel-stat" id="wstat2">STOP (0)</div>
            <button class="inv-btn" id="invBtn2" onclick="toggleInvert(2)">&#8644; Normal Polarity</button>
          </div>

          <!-- Rear Right: Motor 1 -->
          <div class="wheel-card" id="wcard1">
            <div class="wheel-title">REAR RIGHT</div>
            <div class="wheel-sub">Motor 1 (ENA1/D3)</div>
            <div class="wheel-stat" id="wstat1">STOP (0)</div>
            <button class="inv-btn" id="invBtn1" onclick="toggleInvert(1)">&#8644; Normal Polarity</button>
          </div>
        </div>
      </div>

      <!-- Turn Ratio Slider -->
      <div class="speed-box" style="margin-bottom:0;">
        <div class="speed-header">
          <span>Curve Turn Inner-Wheel Speed Ratio</span>
          <span class="speed-val"><span id="turnRatioVal">45</span>%</span>
        </div>
        <input type="range" id="turnRatio" min="0" max="80" value="45" oninput="document.getElementById('turnRatioVal').innerText=this.value">
      </div>
    </div>

  </div>

  <!-- Auto Drive by Distance or Time Panel -->
  <div class="panel" style="margin-top: 14px;">
    <div class="panel-header">
      <span class="panel-title">Auto Drive (Distance or Time)</span>
      <span style="font-size:0.75rem;color:var(--muted);">Enter either Distance OR Time &bull; Rate: 10 cm = 2 sec</span>
    </div>
    <div class="auto-drive-grid">
      <div class="field-group">
        <label for="inputDistance">1. Distance (cm)</label>
        <input type="number" id="inputDistance" class="field-input" placeholder="e.g. 10" min="0" step="any" oninput="onDistanceInput()">
      </div>
      <div class="field-group">
        <label for="inputTime">2. Time (sec)</label>
        <input type="number" id="inputTime" class="field-input" placeholder="e.g. 2" min="0" step="any" oninput="onTimeInput()">
      </div>
      <div class="field-group">
        <label for="inputDirection">Direction</label>
        <select id="inputDirection" class="field-input">
          <option value="F">Forward</option>
          <option value="B">Backward</option>
        </select>
      </div>
      <div class="field-group">
        <button class="submit-run-btn" id="autoRunBtn" onclick="runAutoDrive()">&#9654; SUBMIT &amp; RUN</button>
      </div>
    </div>
    <div class="auto-status" id="autoDriveStatus">
      <span id="autoStatusText">Ready: Enter distance (cm) or time (sec) and click Submit</span>
      <span id="autoCalcBadge" style="color:var(--muted);font-size:0.76rem;">10 cm = 2.0 s (5 cm/s)</span>
    </div>
  </div>

  <!-- N20 Gear Motor & TB6612FNG Driver Test Section -->
  <div class="panel" style="margin-top: 14px;">
    <div class="panel-header">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="panel-title">N20 Gear Motor &amp; TB6612FNG Test Bench</span>
        <span class="badge" id="n20PowerBadge" style="background:rgba(16,185,129,0.15);border-color:var(--green);color:var(--green);">POWER: ON (STBY HIGH)</span>
      </div>
      <div class="badge state-pill" id="n20StateBadge">STATE: STOPPED</div>
    </div>

    <!-- Wiring Pin Diagram Banner -->
    <div class="pin-badge-row">
      <span style="color:var(--muted);font-weight:700;">PIN DIAGRAM:</span>
      <div class="pin-item" style="color:var(--accent);">
        <span>PWMA (Speed):</span>
        <span class="pin-pill" style="background:rgba(56,189,248,0.2);color:var(--accent);border:1px solid var(--accent);">D1 [PWM Speed Control]</span>
      </div>
      <div class="pin-item" style="color:#34d399;">
        <span>AIN1 (Dir 1):</span>
        <span class="pin-pill" style="background:rgba(52,211,153,0.2);color:#34d399;border:1px solid #34d399;">D2 [Direction Logic 1]</span>
      </div>
      <div class="pin-item" style="color:#60a5fa;">
        <span>AIN2 (Dir 2):</span>
        <span class="pin-pill" style="background:rgba(96,165,250,0.2);color:#60a5fa;border:1px solid #60a5fa;">D4 [Direction Logic 2]</span>
      </div>
      <div class="pin-item" style="color:#f59e0b;">
        <span>STBY (Standby):</span>
        <span class="pin-pill" style="background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid #f59e0b;">D7 [Standby Control]</span>
      </div>
    </div>

    <div class="n20-grid">
      <!-- Left: Speed Control & Presets -->
      <div class="speed-box" style="margin-bottom:0;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div class="speed-header">
            <span>N20 Motor Speed (PWM)</span>
            <span class="speed-val"><span id="n20SpeedVal">180</span> / 255</span>
          </div>
          <input type="range" id="n20Speed" min="0" max="255" value="180" oninput="updateN20Speed(this.value)">
        </div>
        <div class="gears" style="margin-top:10px;">
          <button class="gear-btn" id="n20Gear1" onclick="setN20SpeedPreset(70, 1)">SLOW (70)</button>
          <button class="gear-btn" id="n20Gear2" onclick="setN20SpeedPreset(130, 2)">MED (130)</button>
          <button class="gear-btn active" id="n20Gear3" onclick="setN20SpeedPreset(180, 3)">FAST (180)</button>
          <button class="gear-btn" id="n20Gear4" onclick="setN20SpeedPreset(255, 4)">MAX (255)</button>
        </div>
      </div>

      <!-- Right: Direction & On/Off Controls -->
      <div style="display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <button class="ctrl-btn primary-dir" id="n20FwdBtn" style="height:58px;" onclick="setN20Direction('F')">
            <span class="arrow" style="font-size:1.3rem;">&#9650;</span>
            <span class="lbl">FORWARD</span>
          </button>
          <button class="ctrl-btn primary-dir" id="n20RevBtn" style="height:58px;" onclick="setN20Direction('B')">
            <span class="arrow" style="font-size:1.3rem;">&#9660;</span>
            <span class="lbl">BACKWARD</span>
          </button>
          <button class="ctrl-btn stop-center" style="height:58px;" onclick="stopN20Motor()">
            <span class="arrow" style="font-size:1.3rem;">&#9632;</span>
            <span class="lbl">STOP</span>
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn-power-on" id="n20PowerOnBtn" onclick="setN20Power(true)">
            &#9889; MOTOR ON (STBY HIGH)
          </button>
          <button class="btn-power-off" id="n20PowerOffBtn" onclick="setN20Power(false)">
            &#9211; MOTOR OFF (STBY LOW)
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Panel: Individual Motor Diagnostics -->
  <div class="panel" style="margin-top: 14px;">
    <div class="panel-header">
      <span class="panel-title">Individual Motor Bench Test</span>
      <span style="font-size:0.75rem;color:var(--muted);">Test each wheel independently</span>
    </div>
    <div class="motors-grid" id="motorsContainer"></div>
  </div>
</div>

<script>
// Motor mapping provided by user:
// Motor 4 = Front Left (FL)
// Motor 3 = Front Right (FR)
// Motor 2 = Rear Left (RL)
// Motor 1 = Rear Right (RR)
const motorMeta = [
  { id: 4, name: "Motor 4", pos: "Front-Left (FL)" },
  { id: 3, name: "Motor 3", pos: "Front-Right (FR)" },
  { id: 2, name: "Motor 2", pos: "Rear-Left (RL)" },
  { id: 1, name: "Motor 1", pos: "Rear-Right (RR)" }
];

let masterSpeed = 200;
let holdToDrive = false; // false = TAP/LATCH mode (1 click changes state immediately); true = HOLD mode
let inverted = { 1: false, 2: false, 3: false, 4: false };
let individualDir = { 1: 'F', 2: 'F', 3: 'F', 4: 'F' };
let activeMove = null;

// Serialized HTTP command queue so ESP8266 never drops or reorders rapid key presses
let reqInFlight = false;
let pendingReq = null;

function sendQueuedRequest(url, statusText) {
  pendingReq = { url, statusText };
  processRequestQueue();
}

function processRequestQueue() {
  if (reqInFlight || !pendingReq) return;
  const current = pendingReq;
  pendingReq = null;
  reqInFlight = true;

  fetch(current.url, { cache: 'no-store' })
    .then(() => setConnStatus(true, current.statusText))
    .catch(() => setConnStatus(false, 'LINK ERR'))
    .finally(() => {
      reqInFlight = false;
      if (pendingReq) processRequestQueue();
    });
}

// Load saved polarity settings if any
try {
  const savedInv = localStorage.getItem('rc_inverted');
  if (savedInv) {
    inverted = JSON.parse(savedInv);
    for (let m = 1; m <= 4; m++) updateInvertUI(m);
  }
} catch (e) {}

// Build Individual Motor Test Cards in order: M4(FL), M3(FR), M2(RL), M1(RR)
const mContainer = document.getElementById('motorsContainer');
motorMeta.forEach(m => {
  mContainer.innerHTML += `
    <div class="m-card">
      <div class="m-card-head">
        <h4>${m.name}</h4>
        <span>${m.pos}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
        <span>PWM Speed:</span>
        <strong id="mval${m.id}">150</strong>
      </div>
      <input type="range" min="0" max="255" value="150" id="mspeed${m.id}"
        oninput="document.getElementById('mval${m.id}').innerText=this.value"
        onchange="sendSingleMotor(${m.id})">
      <div class="m-btns">
        <button class="m-btn fwd" onclick="setSingleMotor(${m.id}, 'F')">FWD</button>
        <button class="m-btn rev" onclick="setSingleMotor(${m.id}, 'R')">REV</button>
        <button class="m-btn stp" onclick="stopSingleMotor(${m.id})">STOP</button>
      </div>
    </div>
  `;
});

function actualDir(motorId, requestedDir) {
  if (!inverted[motorId]) return requestedDir;
  return requestedDir === 'F' ? 'R' : 'F';
}

function toggleInvert(motorId) {
  inverted[motorId] = !inverted[motorId];
  try { localStorage.setItem('rc_inverted', JSON.stringify(inverted)); } catch (e) {}
  updateInvertUI(motorId);
}

function updateInvertUI(motorId) {
  const btn = document.getElementById('invBtn' + motorId);
  if (!btn) return;
  if (inverted[motorId]) {
    btn.classList.add('inverted');
    btn.innerHTML = '&#8644; Inverted (Flipped)';
  } else {
    btn.classList.remove('inverted');
    btn.innerHTML = '&#8644; Normal Polarity';
  }
}

function updateMasterSpeed(val) {
  masterSpeed = parseInt(val, 10);
  document.getElementById('masterSpeedVal').innerText = masterSpeed;
  document.querySelectorAll('.gear-btn').forEach(b => b.classList.remove('active'));
  if (activeMove && !holdToDrive) {
    executeManeuver(activeMove);
  }
}

function setGear(spd, gearIdx) {
  masterSpeed = spd;
  document.getElementById('masterSpeed').value = spd;
  document.getElementById('masterSpeedVal').innerText = spd;
  document.querySelectorAll('.gear-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('gear' + gearIdx).classList.add('active');
  if (activeMove && !holdToDrive) {
    executeManeuver(activeMove);
  }
}

function switchPad(mode) {
  document.getElementById('tabDpad').classList.toggle('active', mode === 'dpad');
  document.getElementById('tabJoy').classList.toggle('active', mode === 'joy');
  document.getElementById('dpadWrap').style.display = mode === 'dpad' ? 'block' : 'none';
  document.getElementById('joystickWrap').style.display = mode === 'joy' ? 'flex' : 'none';
  stopAll();
}

function toggleHoldMode() {
  holdToDrive = !holdToDrive;
  const btn = document.getElementById('tabHold');
  btn.innerText = holdToDrive ? 'MODE: HOLD' : 'MODE: TAP';
  btn.classList.toggle('active', !holdToDrive);
  stopAll();
}

function updateChassisVisualizer(states, label, arrowChar) {
  document.getElementById('driveStateBadge').innerText = 'STATE: ' + label;
  document.getElementById('carArrow').innerHTML = arrowChar;

  for (let m = 1; m <= 4; m++) {
    const st = states[m];
    const card = document.getElementById('wcard' + m);
    const stat = document.getElementById('wstat' + m);
    card.classList.remove('active-fwd', 'active-rev');

    if (st.s === 0) {
      stat.innerText = 'STOP (0)';
      stat.style.color = '#9ca3af';
    } else if (st.d === 'F') {
      card.classList.add('active-fwd');
      stat.innerText = 'FWD (' + st.s + ')';
      stat.style.color = '#10b981';
    } else {
      card.classList.add('active-rev');
      stat.innerText = 'REV (' + st.s + ')';
      stat.style.color = '#f59e0b';
    }
  }
}

function setConnStatus(ok, text) {
  const dot = document.getElementById('connDot');
  const lbl = document.getElementById('connText');
  dot.style.background = ok ? '#10b981' : '#ef4444';
  dot.style.boxShadow = ok ? '0 0 8px #10b981' : '0 0 8px #ef4444';
  lbl.innerText = text;
}

// Send all 4 motors simultaneously in a single request to ESP8266 (/drive)
// Left wheels: M4 (Front-Left), M2 (Rear-Left)
// Right wheels: M3 (Front-Right), M1 (Rear-Right)
function sendDriveBatch(leftSpeed, leftDir, rightSpeed, rightDir, label, arrowHtml) {
  leftSpeed = Math.max(0, Math.min(255, Math.round(leftSpeed)));
  rightSpeed = Math.max(0, Math.min(255, Math.round(rightSpeed)));

  const states = {
    4: { s: leftSpeed,  d: leftDir },  // Front-Left
    2: { s: leftSpeed,  d: leftDir },  // Rear-Left
    3: { s: rightSpeed, d: rightDir }, // Front-Right
    1: { s: rightSpeed, d: rightDir }  // Rear-Right
  };

  updateChassisVisualizer(states, label, arrowHtml);

  const d1 = actualDir(1, rightDir);
  const d2 = actualDir(2, leftDir);
  const d3 = actualDir(3, rightDir);
  const d4 = actualDir(4, leftDir);

  const url = `/drive?s1=${rightSpeed}&d1=${d1}&s2=${leftSpeed}&d2=${d2}&s3=${rightSpeed}&d3=${d3}&s4=${leftSpeed}&d4=${d4}`;
  sendQueuedRequest(url, label);
}

function executeManeuver(move) {
  activeMove = move;
  const spd = masterSpeed;
  const ratio = parseInt(document.getElementById('turnRatio').value, 10) / 100.0;
  const innerSpd = Math.round(spd * ratio);

  switch (move) {
    case 'F':  // All 4 wheels Forward
      sendDriveBatch(spd, 'F', spd, 'F', 'FORWARD', '&#9650;');
      break;
    case 'B':  // All 4 wheels Reverse
      sendDriveBatch(spd, 'R', spd, 'R', 'REVERSE', '&#9660;');
      break;
    case 'L':  // Spin/Tank Left: Left (M4,M2) Reverse, Right (M3,M1) Forward
      sendDriveBatch(spd, 'R', spd, 'F', 'SPIN LEFT', '&#8634;');
      break;
    case 'R':  // Spin/Tank Right: Left (M4,M2) Forward, Right (M3,M1) Reverse
      sendDriveBatch(spd, 'F', spd, 'R', 'SPIN RIGHT', '&#8635;');
      break;
    case 'FL': // Curve Forward-Left (swapped: Left full Forward, Right slower Forward)
      sendDriveBatch(spd, 'F', innerSpd, 'F', 'CURVE FL', '&#8598;');
      break;
    case 'FR': // Curve Forward-Right (swapped: Left slower Forward, Right full Forward)
      sendDriveBatch(innerSpd, 'F', spd, 'F', 'CURVE FR', '&#8599;');
      break;
    case 'BL': // Curve Back-Left: Left slower Reverse, Right full Reverse
      sendDriveBatch(innerSpd, 'R', spd, 'R', 'CURVE BL', '&#8601;');
      break;
    case 'BR': // Curve Back-Right: Left full Reverse, Right slower Reverse
      sendDriveBatch(spd, 'R', innerSpd, 'R', 'CURVE BR', '&#8600;');
      break;
  }
}

// Auto Drive (Distance / Time) state: 2 sec = 10 cm (0.2 sec per cm, 5 cm per sec)
let autoDriveTimer = null;
let autoDriveInterval = null;

function clearAutoDriveTimers(resetStatusText = false) {
  if (autoDriveTimer) {
    clearTimeout(autoDriveTimer);
    autoDriveTimer = null;
  }
  if (autoDriveInterval) {
    clearInterval(autoDriveInterval);
    autoDriveInterval = null;
  }
  if (resetStatusText) {
    const st = document.getElementById('autoStatusText');
    if (st) st.innerText = 'Stopped';
  }
}

function onDistanceInput() {
  const distVal = document.getElementById('inputDistance').value;
  if (distVal !== '') {
    document.getElementById('inputTime').value = '';
    const d = parseFloat(distVal);
    if (!isNaN(d) && d > 0) {
      const calcSec = (d * 0.2).toFixed(2);
      document.getElementById('autoCalcBadge').innerText = `${d} cm → ${calcSec} sec`;
    }
  } else {
    document.getElementById('autoCalcBadge').innerText = '10 cm = 2.0 s (5 cm/s)';
  }
}

function onTimeInput() {
  const timeVal = document.getElementById('inputTime').value;
  if (timeVal !== '') {
    document.getElementById('inputDistance').value = '';
    const t = parseFloat(timeVal);
    if (!isNaN(t) && t > 0) {
      const calcCm = (t * 5).toFixed(1);
      document.getElementById('autoCalcBadge').innerText = `${t} sec → ${calcCm} cm`;
    }
  } else {
    document.getElementById('autoCalcBadge').innerText = '10 cm = 2.0 s (5 cm/s)';
  }
}

function runAutoDrive() {
  const distStr = document.getElementById('inputDistance').value.trim();
  const timeStr = document.getElementById('inputTime').value.trim();
  const dir = document.getElementById('inputDirection').value; // 'F' or 'B'
  const statusEl = document.getElementById('autoStatusText');

  let durationSec = 0;
  let summaryDesc = '';

  if (distStr !== '') {
    const distCm = parseFloat(distStr);
    if (isNaN(distCm) || distCm <= 0) {
      statusEl.innerText = 'Please enter a valid Distance > 0 cm';
      return;
    }
    // 10 cm = 2 sec => 1 cm = 0.2 sec
    durationSec = distCm * (2.0 / 10.0);
    summaryDesc = `${distCm} cm (${durationSec.toFixed(1)}s)`;
  } else if (timeStr !== '') {
    const timeSec = parseFloat(timeStr);
    if (isNaN(timeSec) || timeSec <= 0) {
      statusEl.innerText = 'Please enter a valid Time > 0 sec';
      return;
    }
    durationSec = timeSec;
    const estCm = (timeSec * (10.0 / 2.0)).toFixed(1);
    summaryDesc = `${timeSec}s (~${estCm} cm)`;
  } else {
    statusEl.innerText = 'Please enter either Distance (cm) OR Time (sec)';
    return;
  }

  clearAutoDriveTimers(false);

  const dirLabel = dir === 'F' ? 'FORWARD' : 'BACKWARD';
  executeManeuver(dir);

  const endTime = Date.now() + Math.round(durationSec * 1000);
  statusEl.innerText = `Running ${dirLabel}: ${durationSec.toFixed(1)}s left | Target: ${summaryDesc}`;

  autoDriveInterval = setInterval(() => {
    const remainingMs = endTime - Date.now();
    if (remainingMs > 0) {
      statusEl.innerText = `Running ${dirLabel}: ${(remainingMs / 1000).toFixed(1)}s left | Target: ${summaryDesc}`;
    }
  }, 100);

  autoDriveTimer = setTimeout(() => {
    clearAutoDriveTimers(false);
    stopAll();
    statusEl.innerText = `Completed ${dirLabel}: ${summaryDesc}`;
  }, Math.round(durationSec * 1000));
}

function stopAll() {
  clearAutoDriveTimers(true);
  activeMove = null;
  document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('pressed'));
  updateChassisVisualizer(
    { 1: {s:0,d:'F'}, 2: {s:0,d:'F'}, 3: {s:0,d:'F'}, 4: {s:0,d:'F'} },
    'STOPPED',
    '&#9679;'
  );

  for (let i = 1; i <= 4; i++) {
    const sl = document.getElementById('mspeed' + i);
    const vl = document.getElementById('mval' + i);
    if (sl) sl.value = 0;
    if (vl) vl.innerText = 0;
  }

  // Update N20 UI indicators on stop all
  const n20Badge = document.getElementById('n20StateBadge');
  if (n20Badge && n20Power) {
    n20CurrentDir = 'STOP';
    n20Badge.innerText = 'STATE: STOPPED';
    n20Badge.style.color = 'var(--accent)';
    n20Badge.style.borderColor = 'var(--accent)';
    const n20Fwd = document.getElementById('n20FwdBtn');
    const n20Rev = document.getElementById('n20RevBtn');
    if (n20Fwd) n20Fwd.classList.remove('pressed');
    if (n20Rev) n20Rev.classList.remove('pressed');
  }

  sendQueuedRequest('/stopall', 'STOPPED');
}

// Single motor bench test functions
function sendSingleMotor(id) {
  const speed = parseInt(document.getElementById('mspeed' + id).value, 10);
  const reqDir = individualDir[id];
  const finalDir = actualDir(id, reqDir);

  const card = document.getElementById('wcard' + id);
  const stat = document.getElementById('wstat' + id);
  card.classList.remove('active-fwd', 'active-rev');
  if (speed === 0) {
    stat.innerText = 'STOP (0)';
    stat.style.color = '#9ca3af';
  } else if (reqDir === 'F') {
    card.classList.add('active-fwd');
    stat.innerText = 'FWD (' + speed + ')';
    stat.style.color = '#10b981';
  } else {
    card.classList.add('active-rev');
    stat.innerText = 'REV (' + speed + ')';
    stat.style.color = '#f59e0b';
  }

  sendQueuedRequest(`/cmd?m=${id}&s=${speed}&d=${finalDir}`, `M${id}: ${speed} ${reqDir}`);
}

function setSingleMotor(id, dir) {
  individualDir[id] = dir;
  const sl = document.getElementById('mspeed' + id);
  if (parseInt(sl.value, 10) === 0) {
    sl.value = masterSpeed;
    document.getElementById('mval' + id).innerText = masterSpeed;
  }
  sendSingleMotor(id);
}

function stopSingleMotor(id) {
  document.getElementById('mspeed' + id).value = 0;
  document.getElementById('mval' + id).innerText = 0;
  sendSingleMotor(id);
}

// N20 Motor & TB6612FNG Driver Bench Test Functions
let n20Speed = 180;
let n20CurrentDir = 'STOP';
let n20Power = true;

function updateN20Speed(val) {
  n20Speed = parseInt(val, 10);
  document.getElementById('n20SpeedVal').innerText = n20Speed;
  document.querySelectorAll('[id^="n20Gear"]').forEach(b => b.classList.remove('active'));
  if (n20Power && (n20CurrentDir === 'F' || n20CurrentDir === 'B')) {
    sendQueuedRequest(`/n20?dir=${n20CurrentDir}&speed=${n20Speed}&power=1`, `N20: ${n20CurrentDir === 'F' ? 'FWD' : 'REV'} ${n20Speed}`);
  }
}

function setN20SpeedPreset(val, gearIdx) {
  document.getElementById('n20Speed').value = val;
  document.getElementById('n20SpeedVal').innerText = val;
  n20Speed = val;
  document.querySelectorAll('[id^="n20Gear"]').forEach(b => b.classList.remove('active'));
  const targetGear = document.getElementById('n20Gear' + gearIdx);
  if (targetGear) targetGear.classList.add('active');
  if (n20Power && (n20CurrentDir === 'F' || n20CurrentDir === 'B')) {
    sendQueuedRequest(`/n20?dir=${n20CurrentDir}&speed=${n20Speed}&power=1`, `N20: ${n20CurrentDir === 'F' ? 'FWD' : 'REV'} ${n20Speed}`);
  }
}

function setN20Direction(dir) {
  if (!n20Power) {
    setN20Power(true);
  }
  n20CurrentDir = dir;
  const badge = document.getElementById('n20StateBadge');
  const fwdBtn = document.getElementById('n20FwdBtn');
  const revBtn = document.getElementById('n20RevBtn');

  if (fwdBtn) fwdBtn.classList.toggle('pressed', dir === 'F');
  if (revBtn) revBtn.classList.toggle('pressed', dir === 'B');

  if (dir === 'F') {
    badge.innerText = 'STATE: FORWARD (' + n20Speed + ')';
    badge.style.color = 'var(--green)';
    badge.style.borderColor = 'var(--green)';
  } else if (dir === 'B') {
    badge.innerText = 'STATE: BACKWARD (' + n20Speed + ')';
    badge.style.color = 'var(--amber)';
    badge.style.borderColor = 'var(--amber)';
  }
  sendQueuedRequest(`/n20?dir=${dir}&speed=${n20Speed}&power=1`, `N20: ${dir === 'F' ? 'FWD' : 'REV'} ${n20Speed}`);
}

function stopN20Motor() {
  n20CurrentDir = 'STOP';
  const badge = document.getElementById('n20StateBadge');
  if (badge) {
    badge.innerText = 'STATE: STOPPED';
    badge.style.color = 'var(--accent)';
    badge.style.borderColor = 'var(--accent)';
  }
  const fwdBtn = document.getElementById('n20FwdBtn');
  const revBtn = document.getElementById('n20RevBtn');
  if (fwdBtn) fwdBtn.classList.remove('pressed');
  if (revBtn) revBtn.classList.remove('pressed');

  sendQueuedRequest(`/n20?dir=STOP&speed=0&power=${n20Power ? 1 : 0}`, 'N20: STOPPED');
}

function setN20Power(on) {
  n20Power = on;
  const pBadge = document.getElementById('n20PowerBadge');
  const sBadge = document.getElementById('n20StateBadge');
  const fwdBtn = document.getElementById('n20FwdBtn');
  const revBtn = document.getElementById('n20RevBtn');

  if (on) {
    if (pBadge) {
      pBadge.innerText = 'POWER: ON (STBY HIGH)';
      pBadge.style.color = 'var(--green)';
      pBadge.style.borderColor = 'var(--green)';
      pBadge.style.background = 'rgba(16,185,129,0.15)';
    }
    if (n20CurrentDir === 'F' || n20CurrentDir === 'B') {
      setN20Direction(n20CurrentDir);
    } else {
      if (sBadge) {
        sBadge.innerText = 'STATE: STOPPED';
        sBadge.style.color = 'var(--accent)';
        sBadge.style.borderColor = 'var(--accent)';
      }
      sendQueuedRequest(`/n20?power=1&dir=STOP&speed=0`, 'N20: ON (STBY HIGH)');
    }
  } else {
    n20CurrentDir = 'OFF';
    if (fwdBtn) fwdBtn.classList.remove('pressed');
    if (revBtn) revBtn.classList.remove('pressed');
    if (pBadge) {
      pBadge.innerText = 'POWER: OFF (STBY LOW)';
      pBadge.style.color = 'var(--red)';
      pBadge.style.borderColor = 'var(--red)';
      pBadge.style.background = 'rgba(239,68,68,0.15)';
    }
    if (sBadge) {
      sBadge.innerText = 'STATE: OFF (STBY LOW)';
      sBadge.style.color = 'var(--red)';
      sBadge.style.borderColor = 'var(--red)';
    }
    sendQueuedRequest('/n20?power=0&dir=STOP&speed=0', 'N20: OFF (STBY LOW)');
  }
}

// Attach Touch & Mouse events to D-Pad buttons
document.querySelectorAll('.ctrl-btn[data-move]').forEach(btn => {
  const move = btn.getAttribute('data-move');

  const startHandler = (e) => {
    e.preventDefault();
    document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('pressed'));
    btn.classList.add('pressed');
    executeManeuver(move);
  };

  const endHandler = (e) => {
    e.preventDefault();
    if (holdToDrive && activeMove === move) {
      btn.classList.remove('pressed');
      stopAll();
    }
  };

  btn.addEventListener('mousedown', startHandler);
  btn.addEventListener('touchstart', startHandler, { passive: false });

  btn.addEventListener('mouseup', endHandler);
  btn.addEventListener('mouseleave', endHandler);
  btn.addEventListener('touchend', endHandler);
  btn.addEventListener('touchcancel', endHandler);
});

// Keyboard WASD + Arrow Keys Support (Instant response on 1st press)
const keysDown = new Set();
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const activeEl = document.activeElement;
  const isTypingField = activeEl && (
    (activeEl.tagName === 'INPUT' && activeEl.type === 'number') ||
    activeEl.tagName === 'SELECT'
  );

  if (isTypingField) {
    if (key === 'enter') {
      e.preventDefault();
      activeEl.blur();
      runAutoDrive();
    }
    return;
  }

  // Always allow Spacebar or X to stop immediately, even if a slider/button had focus
  if (key === ' ' || key === 'x') {
    e.preventDefault();
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    keysDown.clear();
    stopAll();
    return;
  }

  if (key >= '1' && key <= '4') {
    e.preventDefault();
    const speeds = [110, 165, 200, 255];
    const idx = parseInt(key, 10);
    setGear(speeds[idx - 1], idx);
    return;
  }

  const valid = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
  if (!valid.includes(key)) return;

  // Prevent sliders/page scroll from stealing Arrow or WASD keys
  e.preventDefault();
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }

  if (e.repeat && keysDown.has(key)) return;
  keysDown.add(key);
  updateKeyboardDrive();
}, { capture: true });

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (keysDown.has(key)) {
    keysDown.delete(key);
    if (holdToDrive) {
      updateKeyboardDrive();
    }
  }
}, { capture: true });

window.addEventListener('blur', () => {
  keysDown.clear();
  if (holdToDrive) stopAll();
});

function updateKeyboardDrive() {
  const up = keysDown.has('w') || keysDown.has('arrowup');
  const down = keysDown.has('s') || keysDown.has('arrowdown');
  const left = keysDown.has('a') || keysDown.has('arrowleft');
  const right = keysDown.has('d') || keysDown.has('arrowright');

  let move = null;
  if (up && left) move = 'FL';
  else if (up && right) move = 'FR';
  else if (down && left) move = 'BL';
  else if (down && right) move = 'BR';
  else if (up) move = 'F';
  else if (down) move = 'B';
  else if (left) move = 'L';
  else if (right) move = 'R';

  if (move) {
    document.querySelectorAll('.ctrl-btn').forEach(b => {
      b.classList.toggle('pressed', b.getAttribute('data-move') === move);
    });
    executeManeuver(move);
  } else if (holdToDrive) {
    stopAll();
  }
}

// Virtual 360° Joystick Logic
const joyBase = document.getElementById('joyBase');
const joyStick = document.getElementById('joyStick');
let joyActive = false;
let lastJoySent = 0;

function handleJoyMove(clientX, clientY) {
  const rect = joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxR = (rect.width / 2) - 37;

  let dx = clientX - cx;
  let dy = clientY - cy;
  const dist = Math.hypot(dx, dy);

  if (dist > maxR) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
  }

  joyStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

  const now = Date.now();
  if (now - lastJoySent < 120) return;
  lastJoySent = now;

  // Normalize -1..1 (throttle = -dy, steering = dx)
  const normY = -dy / maxR;
  const normX = dx / maxR;

  if (Math.hypot(normX, normY) < 0.15) {
    stopAll();
    return;
  }

  const steerX = normY >= 0 ? -normX : normX;
  let leftVal = (normY + steerX) * masterSpeed;
  let rightVal = (normY - steerX) * masterSpeed;

  leftVal = Math.max(-masterSpeed, Math.min(masterSpeed, leftVal));
  rightVal = Math.max(-masterSpeed, Math.min(masterSpeed, rightVal));

  const lDir = leftVal >= 0 ? 'F' : 'R';
  const rDir = rightVal >= 0 ? 'F' : 'R';

  sendDriveBatch(Math.abs(leftVal), lDir, Math.abs(rightVal), rDir, 'JOYSTICK', '&#9678;');
}

function resetJoystick() {
  if (!joyActive) return;
  joyActive = false;
  joyStick.style.transform = 'translate(-50%, -50%)';
  stopAll();
}

joyBase.addEventListener('mousedown', (e) => { joyActive = true; handleJoyMove(e.clientX, e.clientY); });
window.addEventListener('mousemove', (e) => { if (joyActive) handleJoyMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', resetJoystick);

joyBase.addEventListener('touchstart', (e) => {
  e.preventDefault();
  joyActive = true;
  handleJoyMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

joyBase.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (joyActive) handleJoyMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

joyBase.addEventListener('touchend', resetJoystick);
joyBase.addEventListener('touchcancel', resetJoystick);
</script>
</body>
</html>
)rawliteral";

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
  while (millis() - start < 70) {
    if (unoSerial.available()) {
      char c = unoSerial.read();
      if (c == '\n') {
        delay(5);
        break;
      }
    }
    yield();
  }
}

// Synchronized 4-wheel car drive endpoint:
// /drive?s1=200&d1=F&s2=200&d2=F&s3=200&d3=F&s4=200&d4=F
// Motor 4 = Front-Left, Motor 3 = Front-Right, Motor 2 = Rear-Left, Motor 1 = Rear-Right
void handleDrive() {
  int s1 = constrain(server.arg("s1").toInt(), 0, 255);
  int s2 = constrain(server.arg("s2").toInt(), 0, 255);
  int s3 = constrain(server.arg("s3").toInt(), 0, 255);
  int s4 = constrain(server.arg("s4").toInt(), 0, 255);

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
    controlN20Motor("STOP", 0, n20PowerState);
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
  unoSerial.println("STOP");
  controlN20Motor("STOP", 0, n20PowerState);
  Serial.println("[CMD -> UNO] STOP (All 4 wheels stopped)");
  Serial.println("[N20 MOTOR] Stopped via Stop All");
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
  unoSerial.begin(9600);
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
