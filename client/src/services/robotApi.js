/**
 * Unified Robot API Service
 * Handles HTTP REST calls with timeout protection as a reliable fallback
 * or supplementary endpoint provider.
 */

export class RobotApi {
  constructor(ip, port = 80) {
    this.ip = ip;
    this.port = port;
    this.baseUrl = `http://${ip}:${port}`;
  }

  setIp(ip, port = 80) {
    this.ip = ip;
    this.port = port;
    this.baseUrl = `http://${ip}:${port}`;
  }

  async fetchWithTimeout(endpoint, options = {}, timeoutMs = 1500) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        mode: "cors",
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async sendDrive(s1, d1, s2, d2, s3, d3, s4, d4) {
    const query = `s1=${s1}&d1=${d1}&s2=${s2}&d2=${d2}&s3=${s3}&d3=${d3}&s4=${s4}&d4=${d4}`;
    return this.fetchWithTimeout(`/drive?${query}`);
  }

  async sendStop(emergency = false) {
    const query = emergency ? "?all=1" : "";
    return this.fetchWithTimeout(`/stopall${query}`);
  }

  async sendN20(dir, speed, power = true) {
    const query = `dir=${dir}&speed=${speed}&power=${power ? 1 : 0}`;
    return this.fetchWithTimeout(`/n20?${query}`);
  }

  async getStatus() {
    const res = await this.fetchWithTimeout("/status");
    if (!res.ok) throw new Error("Failed to fetch status");
    return res.json();
  }
}
