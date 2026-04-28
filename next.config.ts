import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    // 局域网调试:把下面替换为 Windows 主机在路由器下的实际 IP
    // 查看方法(在 Windows PowerShell):ipconfig | findstr IPv4
    "192.168.1.100",
    "192.168.0.100",
    "10.0.0.100",
    // WSL2 虚拟网卡(如果直接用 WSL IP 访问)
    "172.19.117.116",
    // 主机名通配(.local 是 mDNS 常见后缀)
    "*.local",
  ],
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
