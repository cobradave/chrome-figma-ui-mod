function isFigmaHostname(hostname) {
  return hostname === 'figma.com' || hostname.endsWith('.figma.com');
}

function isFigmaUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    return isFigmaHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}
