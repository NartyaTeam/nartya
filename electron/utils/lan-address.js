import os from "os";

const VIRTUAL_ADAPTER = /^(vEthernet|docker|br-|veth|VMware|VirtualBox|utun|tun|tap|wsl|zerotier|tailscale|nordlynx|radmin|hamachi)/i;

function toInt(ip) {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function lanInterfaces() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      out.push({ name, address: a.address, netmask: a.netmask, virtual: VIRTUAL_ADAPTER.test(name) });
    }
  }
  return out;
}

/** Celle de la carte qui partage le sous-réseau de `remoteIp`. */
export function localAddressFor(remoteIp) {
  const interfaces = lanInterfaces();
  if (remoteIp && /^\d+\.\d+\.\d+\.\d+$/.test(remoteIp)) {
    const match = interfaces.find((i) => sharesSubnet(remoteIp, i));
    if (match) return match.address;
  }
  return (interfaces.find((i) => !i.virtual) || interfaces[0])?.address || "127.0.0.1";
}

function sharesSubnet(ip, iface) {
  const mask = toInt(iface.netmask);
  return (toInt(ip) & mask) === (toInt(iface.address) & mask);
}

/** WSL, Docker, VPN… */
export function isVirtualNetworkAddress(ip) {
  const iface = lanInterfaces().find((i) => sharesSubnet(ip, i));
  return !!iface?.virtual;
}

/** 10/8, 172.16/12, 192.168/16 */
export function isPrivateIpv4(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || "");
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
